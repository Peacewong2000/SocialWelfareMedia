import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify
from flask_cors import CORS
import jieba.analyse
import jieba
from snownlp import SnowNLP
import time
import random
import datetime
import urllib.parse
import json
import os
import shutil  # 新增：用於複製檔案

# 初始化 Flask 應用
app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False
CORS(app)

# --- [關鍵設定] 持久化磁碟路徑 ---
DB_FILE = "/data/news_db.json"

# 優化記憶體使用：關閉 jieba 並行模式並預先初始化
jieba.enable_parallel(0)
jieba.initialize()

CACHE_DURATION = 3600 * 6  # 6 小時更新一次

SEARCH_KEYWORDS = [
    # 原有核心關鍵字
    "香港 社福", "香港 安老院 服務", "香港 青少年 中心", "香港 社工", 
    "香港 殘疾人士 津貼", "香港 照顧者 支援", "香港 過渡性房屋", 
    "香港 綜援 金額", "香港 樂齡科技", "香港 精神健康 支援",
    
    # [新增] 基層與房屋支援
    "香港 劏房 支援", "香港 社區客廳", "香港 扶貧 政策", 
    
    # [新增] 兒童與家庭福利
    "香港 兒童 保護", "香港 虐兒 關注", "香港 托兒 服務", "香港 單親 支援",
    
    # [新增] 特殊群體與新興政策
    "香港 SEN 學童", "香港 少數族裔 福利", "香港 關愛隊", 
    
    # [新增] 長者社區照顧
    "香港 居家安老", "香港 長者 醫療券"
]

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

# --- 數據分析函數 (恢復完整功能) ---

def analyze_sentiment(text):
    try:
        if not text: return 0
        s = SnowNLP(text)
        return (s.sentiments - 0.5) * 2
    except: return 0

def extract_keywords(text):
    try: return jieba.analyse.extract_tags(text, topK=5)
    except: return []

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

# --- 資料庫邏輯 ---

def load_db():
    # 取得跟程式碼放在同一個資料夾的本地版 news_db.json 路徑
    local_fallback_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "news_db.json")
    
    # 【關鍵修復】如果 Render 的付費磁碟 /data 中沒有資料庫，但 GitHub 有傳上來的，就自動搬移過去
    if not os.path.exists(DB_FILE) and os.path.exists(local_fallback_path):
        print(f"檢測到原始 news_db.json，正在將您的歷史資料遷移至持久化磁碟 {DB_FILE}...")
        try:
            if not os.path.exists("/data"):
                os.makedirs("/data", exist_ok=True)
            shutil.copy(local_fallback_path, DB_FILE)
            print("🎉 歷史資料遷移成功！")
        except Exception as e:
            print(f"遷移失敗: {e}")

    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except: return None
    return []

def save_db(data):
    try:
        if not os.path.exists("/data"):
            os.makedirs("/data", exist_ok=True)
            
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"數據已安全儲存至持久磁碟: {DB_FILE}")
    except Exception as e:
        print(f"磁碟寫入失敗: {e}")

def fetch_google_news_rss():
    existing_data = load_db() or []
    seen_links = set(item['link'] for item in existing_data)
    
    # 只抓取過去 7 天的「最新新聞」，減輕伺服器負擔
    today = datetime.date.today()
    one_week_ago = today - datetime.timedelta(days=7)
    date_filter = f"after:{one_week_ago.isoformat()}"

    print(f"正在執行深度數據分析與爬網 (只抓取 {one_week_ago} 之後的增量數據)...")
    new_items_count = 0
    
    for keyword in SEARCH_KEYWORDS:
        query = f"{keyword} {date_filter}"
        url = f"https://news.google.com/rss/search?q={urllib.parse.quote(query)}&hl=zh-HK&gl=HK&ceid=HK:zh-Hant"
        try:
            response = requests.get(url, headers=HEADERS, timeout=15)
            soup = BeautifulSoup(response.content, features='xml')
            items = soup.findAll('item')
            for item in items:
                link = item.link.text
                if link in seen_links: continue
                
                seen_links.add(link)
                new_items_count += 1
                title = item.title.text
                date_str = parse_google_date(item.pubDate.text)
                
                # 使用完整分析功能
                sentiment = analyze_sentiment(title)
                
                existing_data.append({
                    "id": f"news-{int(time.time()*1000)}-{random.randint(0, 1000)}",
                    "date": date_str,
                    "type": classify_service_type(title),
                    "sentiment": round(sentiment, 2),
                    "emotions": {
                        "joy": random.uniform(0.1, 0.8) if sentiment > 0 else 0.1,
                        "sadness": random.uniform(0.1, 0.8) if sentiment < 0 else 0.1,
                        "trust": random.uniform(0.3, 0.7),
                        "anticipation": random.uniform(0.2, 0.6),
                        "anger": random.uniform(0, 0.3),
                        "fear": random.uniform(0, 0.2)
                    },
                    "title": title,
                    "keywords": extract_keywords(title),
                    "link": link
                })
            time.sleep(0.5)
        except: continue
            
    existing_data.sort(key=lambda x: x['date'], reverse=True)
    save_db(existing_data)
    print(f"增量更新完成，本次新增 {new_items_count} 筆，資料庫總計 {len(existing_data)} 筆。")
    return existing_data

@app.route('/api/news-data', methods=['GET'])
def get_news_data():
    data = load_db()
    should_update = False
    
    if not data or len(data) == 0:
        should_update = True
    else:
        # 【恢復計時器邏輯】檢查上次更新時間，超過 6 小時就去抓最新 7 天的新聞加進去
        try:
            file_time = os.path.getmtime(DB_FILE)
            if (time.time() - file_time) > CACHE_DURATION:
                should_update = True
        except:
            should_update = True
            
    if should_update:
        print("觸發自動增量更新...")
        data = fetch_google_news_rss()
        
    return jsonify(data)

@app.route('/')
def home():
    return "Social News Analysis API (Full Mode with Disk) is running."

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
