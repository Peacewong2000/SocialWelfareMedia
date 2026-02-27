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
DB_FILE = "/data/news_db.json"
CACHE_DURATION = 3600 * 4 

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

    payload = {
        "model": "deepseek-chat",
        "messages": [
            {
                "role": "system", 
                "content": "你是一個專業的香港社會福利分析專家。請將分析結果僅以 JSON 格式回傳，不要有任何解釋文字。"
            },
            {
                "role": "user", 
                "content": f"""分析以下香港新聞標題。
                標題：「{title}」
                回傳格式：
                {{
                    "is_social_welfare": boolean,
                    "type": "安老服務" | "青少年服務" | "復康服務" | "家庭及兒童" | "社區發展" | "社會保障" | "勞工及就業" | "醫療與精神健康" | "少數族裔支援" | "其他社福",
                    "sentiment": float, 
                    "emotions": {{ "joy": float, "sadness": float, "trust": float, "anticipation": float, "anger": float, "fear": float }},
                    "keywords": [string, string, string, string, string]
                }}"""
            }
        ],
        "response_format": {"type": "json_object"},
        "stream": False
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}"
    }

    try:
        response = requests.post(DEEPSEEK_URL, headers=headers, json=payload, timeout=25)
        response.raise_for_status()
        res_data = response.json()
        content = res_data['choices'][0]['message']['content']
        return json.loads(content)
    except Exception as e:
        return {"error": str(e)}

# --- 資料庫工具 ---
def load_db():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r', encoding='utf-8') as f: return json.load(f)
        except: return []
    return []

def save_db(data):
    if not os.path.exists("/data"): os.makedirs("/data", exist_ok=True)
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ==========================================================
# 🕷️ 背景抓取核心任務
# ==========================================================
SEARCH_KEYWORDS = ["香港 社福", "香港 安老服務", "香港 綜援", "香港 社會福利署"]
is_updating = False

def fetch_news_task():
    data = load_db() or []
    seen_links = set(item['link'] for item in data)
    process_limit = 15
    count = 0
    
    print("🚀 [DeepSeek Engine] 背景更新開始...")
    blacklist = ["酒店", "自助餐", "旅遊", "娛樂城", "金沙", "博彩", "賭場", "著數"]

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
                if any(bad in title for bad in blacklist):
                    seen_links.add(link)
                    continue

                ai_result = analyze_with_deepseek(title)
                
                if ai_result and "error" not in ai_result:
                    if not ai_result.get("is_social_welfare", True):
                        seen_links.add(link)
                        continue
                        
                    data.append({
                        "id": f"ds-{int(time.time()*1000)}",
                        "date": datetime.date.today().isoformat(),
                        "type": ai_result.get("type", "其他社福"),
                        "sentiment": round(ai_result.get("sentiment", 0), 2),
                        "emotions": ai_result.get("emotions", {}),
                        "title": title,
                        "keywords": ai_result.get("keywords", []),
                        "link": link
                    })
                    count += 1
                    seen_links.add(link)
                    time.sleep(1) # DeepSeek 速度快，1秒間隔即可
        except: continue
            
    data.sort(key=lambda x: x['date'], reverse=True)
    save_db(data)

def background_thread():
    global is_updating
    is_updating = True
    try: fetch_news_task()
    finally: is_updating = False

# ==========================================================
# 🚀 API 路由介面 (包含診斷測試)
# ==========================================================

# 1. 資料獲取
@app.route('/api/news-data', methods=['GET'])
def get_data():
    global is_updating
    data = load_db()
    try:
        mtime = os.path.getmtime(DB_FILE)
        if (time.time() - mtime) > CACHE_DURATION and not is_updating:
            threading.Thread(target=background_thread).start()
    except:
        if not is_updating: threading.Thread(target=background_thread).start()
    return jsonify(data)

# 2. 專屬診斷網頁 (即時測試 DeepSeek 效能)
@app.route('/api/test-deepseek', methods=['GET'])
def test_deepseek_live():
    html_template = """
    <html><head><meta charset='utf-8'><title>DeepSeek 診斷工具</title>
    <style>
        body { font-family: -apple-system, sans-serif; background: #0f172a; padding: 20px; max-width: 900px; margin: 0 auto; color: #e2e8f0; }
        .card { background: #1e293b; border-radius: 12px; padding: 20px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); margin-bottom: 25px; border-left: 5px solid #3b82f6; }
        .title { font-weight: bold; color: #f8fafc; margin-bottom: 12px; font-size: 1.1rem; }
        pre { background: #000; padding: 15px; border-radius: 8px; color: #10b981; overflow-x: auto; font-family: monospace; font-size: 0.9rem; border: 1px solid #334155;}
        .error-box { background: #450a0a; color: #fca5a5; padding: 15px; border-radius: 8px; border: 1px solid #991b1b; }
    </style></head><body>
        <h2 style='color:#3b82f6; text-align:center;'>🐋 DeepSeek AI 實時診斷通道</h2>
        <p style='text-align:center; color:#94a3b8;'>正在現場抓取 3 篇最新新聞，並測試 DeepSeek-V3 的分析反應...</p>
    """
    
    if not DEEPSEEK_API_KEY:
        return html_template + "<div class='error-box'>❌ 錯誤：找不到 DEEPSEEK_API_KEY。請在 Render 設定中填寫。</div></body></html>"

    try:
        url = "https://news.google.com/rss/search?q=香港社福&hl=zh-HK&gl=HK&ceid=HK:zh-Hant"
        res = requests.get(url, timeout=10)
        soup = BeautifulSoup(res.content, 'xml')
        items = soup.findAll('item')[:3]
        
        for i, item in enumerate(items):
            title = item.title.text
            html_template += f"<div class='card'><div><b>新聞 {i+1}：</b> {title}</div>"
            
            start_time = time.time()
            ai_data = analyze_with_deepseek(title)
            end_time = time.time()
            
            if "error" in ai_data:
                html_template += f"<div class='error-box'>分析失敗：{ai_data['error']}</div>"
            else:
                duration = round(end_time - start_time, 2)
                html_template += f"<p style='color:#6366f1; font-size:0.8rem;'>⚡ AI 反應時間：{duration} 秒</p>"
                html_template += f"<pre>{json.dumps(ai_data, ensure_ascii=False, indent=4)}</pre>"
            html_template += "</div>"
            time.sleep(1)
            
        return html_template + "</body></html>"
    except Exception as e:
        return html_template + f"<div class='error-box'>測試異常：{str(e)}</div></body></html>"

# 3. 根目錄檢查
@app.route('/')
def home():
    engine = "DeepSeek-V3 (Stable)"
    status = "⚠️ 更新中" if is_updating else "✅ 待命"
    return f"""
    <div style="font-family:sans-serif; text-align:center; padding:50px;">
        <h2 style="color:#3b82f6;">Social News API (DeepSeek Edition)</h2>
        <p>引擎狀態：{engine}</p>
        <p>系統狀態：{status}</p>
        <a href='/api/test-deepseek' style="display:inline-block; margin-top:20px; padding:10px 20px; background:#3b82f6; color:white; text-decoration:none; border-radius:5px;">打開診斷網頁</a>
    </div>
    """

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
