import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify
from flask_cors import CORS
import jieba.analyse
from snownlp import SnowNLP
import time
import random
import datetime
import urllib.parse
import json
import os

# 初始化 Flask 應用
app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False
CORS(app)

# --- 設定 ---
DB_FILE = "news_db.json"
CACHE_DURATION = 3600 * 6 

# 搜尋關鍵字
SEARCH_KEYWORDS = [
    "香港 社福", "香港 安老院 服務", "香港 青少年 中心", "香港 社工", 
    "香港 殘疾人士 津貼", "香港 照顧者 支援", "香港 過渡性房屋", 
    "香港 綜援 金額", "香港 樂齡科技", "香港 精神健康 支援"
]

today = datetime.date.today()
one_year_ago = today - datetime.timedelta(days=365)
date_filter = f"after:{one_year_ago.isoformat()}"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

# --- 輔助函數 ---
def analyze_sentiment(text):
    try:
        if not text: return 0
        s = SnowNLP(text)
        return (s.sentiments - 0.5) * 2
    except:
        return 0

def extract_keywords(text):
    try:
        return jieba.analyse.extract_tags(text, topK=5)
    except:
        return []

def classify_service_type(text):
    text = text.lower()
    if any(k in text for k in ['老人', '長者', '安老', '認知障礙', '樂齡']): return '安老服務'
    elif any(k in text for k in ['青年', '學生', '童軍', '外展', '學童']): return '青少年服務'
    elif any(k in text for k in ['殘疾', '康復', '精神', '無障礙', '智障']): return '復康服務'
    elif any(k in text for k in ['綜援', '津貼', '福利金', '財政預算', '施政報告', '扶貧']): return '社會保障'
    elif any(k in text for k in ['家庭', '虐兒', '親子', '婦女', '幼兒']): return '家庭及兒童'
    elif any(k in text for k in ['房屋', '劏房', '社區', '關愛隊']): return '社區發展'
    else: return '其他社福'

def parse_google_date(pub_date_str):
    formats = ["%a, %d %b %Y %H:%M:%S %Z", "%Y-%m-%d", "%d %b %Y"]
    for fmt in formats:
        try:
            struct_time = time.strptime(pub_date_str, fmt)
            return time.strftime("%Y-%m-%d", struct_time)
        except ValueError: continue
    return datetime.date.today().isoformat()

# --- 資料庫/快取管理 (加強除錯與自動修復) ---

def load_db():
    """讀取本地資料庫 (包含除錯訊息)"""
    abs_path = os.path.abspath(DB_FILE)
    print(f"正在嘗試讀取檔案: {abs_path}")
    
    if os.path.exists(DB_FILE):
        try:
            file_size = os.path.getsize(DB_FILE)
            print(f"檔案存在，大小: {file_size} bytes")
            
            with open(DB_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            if isinstance(data, list):
                print(f"成功讀取 JSON，包含 {len(data)} 筆資料")
                return data
            else:
                print("錯誤：JSON 格式正確，但內容不是列表 (List)")
                return []
                
        except json.JSONDecodeError as e:
            print(f"嚴重錯誤：JSON 檔案格式損毀！無法解析。錯誤位置: {e}")
            # 自動修復：將壞掉的檔案改名，以免卡住程式
            try:
                backup_name = f"{DB_FILE}.corrupted_{int(time.time())}"
                os.rename(DB_FILE, backup_name)
                print(f"已將損毀檔案重新命名為 {backup_name}，將重新建立資料庫。")
            except Exception as rename_error:
                print(f"無法重新命名損毀檔案: {rename_error}")
            
            return None # 回傳 None 表示檔案損毀，需要重爬
            
        except Exception as e:
            print(f"讀取時發生未知錯誤: {e}")
            return None
    else:
        print(f"錯誤：找不到檔案 {DB_FILE}，將回傳空陣列")
        return []

def save_db(data):
    """儲存資料到本地"""
    abs_path = os.path.abspath(DB_FILE)
    print(f"正在寫入檔案: {abs_path}，共 {len(data)} 筆資料")
    try:
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("寫入成功！")
    except Exception as e:
        print(f"寫入失敗: {e}")

def is_cache_valid():
    if not os.path.exists(DB_FILE): return False
    file_time = os.path.getmtime(DB_FILE)
    return (time.time() - file_time) < CACHE_DURATION

# --- 爬蟲邏輯 ---

def fetch_google_news_rss():
    existing_data = load_db()
    
    # 如果資料庫損毀或不存在，初始化為空列表
    if existing_data is None:
        existing_data = []
        seen_links = set()
    else:
        seen_links = set(item['link'] for item in existing_data)
        
    new_items_count = 0
    
    print(f"開始爬取 Google News (範圍: {date_filter})...")
    
    for keyword in SEARCH_KEYWORDS:
        query = f"{keyword} {date_filter}"
        encoded_query = urllib.parse.quote(query)
        url = f"https://news.google.com/rss/search?q={encoded_query}&hl=zh-HK&gl=HK&ceid=HK:zh-Hant"
        
        try:
            print(f"搜尋: {keyword} ...")
            response = requests.get(url, headers=HEADERS, timeout=10)
            response.encoding = 'utf-8'
            
            if response.status_code != 200: continue

            soup = BeautifulSoup(response.content, features='xml')
            items = soup.findAll('item')
            
            for item in items:
                link = item.link.text
                if link in seen_links: continue
                
                seen_links.add(link)
                new_items_count += 1
                
                title = item.title.text
                pub_date_str = item.pubDate.text
                date_str = parse_google_date(pub_date_str)
                
                if date_str < one_year_ago.isoformat(): continue

                sentiment = analyze_sentiment(title)
                is_positive = sentiment > 0
                emotions = {
                    "joy": random.uniform(0.3, 0.9) if is_positive else random.uniform(0, 0.2),
                    "trust": random.uniform(0.3, 0.8),
                    "anticipation": random.uniform(0.2, 0.6),
                    "sadness": random.uniform(0, 0.2) if is_positive else random.uniform(0.3, 0.9),
                    "anger": random.uniform(0, 0.1) if is_positive else random.uniform(0.2, 0.7),
                    "fear": random.uniform(0, 0.2)
                }

                news_item = {
                    "id": f"news-{len(seen_links)}",
                    "date": date_str,
                    "type": classify_service_type(title),
                    "sentiment": round(sentiment, 2),
                    "emotions": emotions,
                    "title": title,
                    "keywords": extract_keywords(title),
                    "link": link
                }
                existing_data.append(news_item)
                
            time.sleep(1)
            
        except Exception as e:
            print(f"Error searching {keyword}: {e}")
            
    print(f"爬取完成！新增了 {new_items_count} 篇新聞，資料庫目前共有 {len(existing_data)} 篇。")
    existing_data.sort(key=lambda x: x['date'])
    save_db(existing_data)
    return existing_data

@app.route('/api/news-data', methods=['GET'])
def get_news_data():
    # 邏輯：先檢查快取
    data = None
    if is_cache_valid():
        print("快取有效，嘗試讀取...")
        data = load_db()
        
    # 如果快取讀取失敗 (None) 或快取無效，則強制更新
    if data is None:
        print("快取過期、檔案損毀或遺失，開始更新數據...")
        data = fetch_google_news_rss()
    else:
        print(f"使用快取資料 (news_db.json)，筆數: {len(data)}")
        
    return jsonify(data)

@app.route('/api/force-refresh', methods=['GET'])
def force_refresh():
    print("收到強制更新請求...")
    data = fetch_google_news_rss()
    return jsonify(data)
@app.route('/', methods=['GET'])
def home():
    return "Social News Analysis API is running!"

# --- 初始化檢查 ---
if not os.path.exists(DB_FILE):
    print("首次執行，正在建立初始資料庫...")
    fetch_google_news_rss()

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000)) # 取得雲端平台分配的 Port
    app.run(host='0.0.0.0', port=port) # 允許外部連線
