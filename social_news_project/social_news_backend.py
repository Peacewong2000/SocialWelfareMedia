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
import shutil
import threading

# 初始化 Flask 應用
app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False
CORS(app)

# --- [系統關鍵設定] ---
# Render 的持久化磁碟路徑
DB_FILE = "/data/news_db.json"
CACHE_DURATION = 3600 * 4  # 每 4 小時更新一次

# 初始化 jieba
jieba.initialize()

# ==========================================================
# 🔑 DeepSeek API 配置
# ==========================================================
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY")
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"

def analyze_with_deepseek(title):
    """
    呼叫 DeepSeek-V3 進行專業的社福新聞分析
    """
    if not DEEPSEEK_API_KEY:
        return {"error": "未偵測到 DEEPSEEK_API_KEY 環境變數"}

    # 建立分析指令 (Prompt)
    prompt = f"""
    你是一個專業的香港社會福利政策分析專家。請分析以下新聞標題，並嚴格以 JSON 格式回傳結果。
    新聞標題：「{title}」

    回傳 JSON 格式要求：
    {{
        "is_social_welfare": boolean, // 判斷是否為香港社福/民生/弱勢群體相關新聞。如果是純廣告、商業旅遊、娛樂則設為 false。
        "type": string, // 必須是：'安老服務', '青少年服務', '復康服務', '家庭及兒童', '社區發展', '社會保障', '勞工及就業', '醫療與精神健康', '少數族裔支援', '其他社福'
        "sentiment": float, // 情感極性：-1.0 (負面) 到 1.0 (正面)。
        "emotions": {{
            "joy": float, "sadness": float, "trust": float, "anticipation": float, "anger": float, "fear": float 
        }},
        "keywords": [string, string, string, string, string] // 提取 5 個精確關鍵字
    }}
    """

    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "你是一個只會回傳 JSON 格式的分析助手。"},
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"}, # 強制要求回傳 JSON 對象
        "stream": False
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}"
    }

    try:
        response = requests.post(DEEPSEEK_URL, headers=headers, json=payload, timeout=30)
        response.raise_for_status() # 檢查 HTTP 狀態
        res_json = response.json()
        content = res_json['choices'][0]['message']['content']
        return json.loads(content)
    except Exception as e:
        print(f"DeepSeek 分析失敗: {e}")
        return {"error": str(e)}

# ==========================================================
# 資料庫處理與工具函數
# ==========================================================
def load_db():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r', encoding='utf-8') as f: return json.load(f)
        except: return []
    # 如果磁碟無資料，尋找本地初始文件
    local_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "news_db.json")
    if os.path.exists(local_path):
        try:
            with open(local_path, 'r', encoding='utf-8') as f: return json.load(f)
        except: return []
    return []

def save_db(data):
    if not os.path.exists("/data"): os.makedirs("/data", exist_ok=True)
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def parse_date(date_str):
    try:
        struct_time = time.strptime(date_str, "%a, %d %b %Y %H:%M:%S %Z")
        return time.strftime("%Y-%m-%d", struct_time)
    except:
        return datetime.date.today().isoformat()

# ==========================================================
# 🕷️ 背景抓取核心任務 (DeepSeek 版本)
# ==========================================================
SEARCH_KEYWORDS = ["香港 社福", "香港 安老服務", "香港 綜援", "香港 社會福利署", "香港 照顧者支援"]
is_updating = False

def fetch_news_with_deepseek():
    data = load_db() or []
    seen_links = set(item['link'] for item in data)
    
    # DeepSeek 額度充足且便宜，我們可以每次處理更多筆 (例如 25 筆)
    process_limit = 25
    count = 0
    
    print("🚀 [DeepSeek Engine] 正在掃描最新新聞...")
    
    # 垃圾廣告黑名單
    blacklist = ["酒店", "自助餐", "旅遊", "娛樂城", "金沙", "博彩", "賭場", "著數", "優惠碼"]

    for kw in SEARCH_KEYWORDS:
        if count >= process_limit: break
        url = f"https://news.google.com/rss/search?q={urllib.parse.quote(kw)}&hl=zh-HK&gl=HK&ceid=HK:zh-Hant"
        try:
            res = requests.get(url, timeout=15)
            soup = BeautifulSoup(res.content, 'xml')
            items = soup.findAll('item')
            
            for it in items:
                if count >= process_limit: break
                link = it.link.text
                if link in seen_links: continue
                
                title = it.title.text
                # 預先過濾
                if any(bad in title for bad in blacklist):
                    seen_links.add(link)
                    continue

                # 呼叫 DeepSeek 進行 AI 分析
                ai_result = analyze_with_deepseek(title)
                
                if ai_result and "error" not in ai_result:
                    # 如果 AI 判定非社福新聞，直接過濾
                    if not ai_result.get("is_social_welfare", True):
                        seen_links.add(link)
                        continue
                        
                    data.append({
                        "id": f"ds-{int(time.time()*1000)}",
                        "date": parse_date(it.pubDate.text),
                        "type": ai_result.get("type", "其他社福"),
                        "sentiment": round(ai_result.get("sentiment", 0), 2),
                        "emotions": ai_result.get("emotions", {}),
                        "title": title,
                        "keywords": ai_result.get("keywords", []),
                        "link": link
                    })
                    count += 1
                    seen_links.add(link)
                    # DeepSeek 不需要像 Gemini 那樣等那麼久，2 秒足以
                    time.sleep(2)
                else:
                    print(f"跳過一篇分析失敗的新聞: {title}")
                    continue
        except Exception as e:
            print(f"抓取關鍵字 {kw} 時出錯: {e}")
            
    data.sort(key=lambda x: x['date'], reverse=True)
    save_db(data)
    print(f"✅ 更新完畢！DeepSeek 成功分析並新增了 {count} 筆新聞。")

def background_task():
    global is_updating
    is_updating = True
    try:
        fetch_news_with_deepseek()
    finally:
        is_updating = False

# ==========================================================
# 🚀 API 路由介面
# ==========================================================

@app.route('/api/news-data', methods=['GET'])
def get_news_data():
    global is_updating
    data = load_db()
    
    # 檢查是否需要觸發背景更新
    try:
        mtime = os.path.getmtime(DB_FILE)
        if (time.time() - mtime) > CACHE_DURATION and not is_updating:
            threading.Thread(target=background_task).start()
    except:
        if not is_updating:
            threading.Thread(target=background_task).start()
            
    return jsonify(data)

@app.route('/')
def home():
    status = "DeepSeek-V3"
    updating = "⚠️ 背景正在抓取..." if is_updating else "✅ 待命中"
    return f"<h3>Social News API Status</h3>分析引擎：{status}<br>更新狀態：{updating}<br><hr><p>您可以透過 /api/news-data 獲取資料</p>"

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
