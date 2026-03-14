import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify
from flask_cors import CORS
import time
import datetime
import urllib.parse
import json
import os
import threading
from email.utils import parsedate_to_datetime

# 初始化 Flask 應用
app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False
CORS(app)

# --- [系統關鍵設定] ---
DB_FILE = "/data/news_db.json"
CACHE_DURATION = 3600 * 4  # 每 4 小時更新一次

# ==========================================================
# 🔑 DeepSeek API 配置
# ==========================================================
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY")
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"

def analyze_with_deepseek(title):
    if not DEEPSEEK_API_KEY:
        return {"error": "未偵測到 DEEPSEEK_API_KEY 環境變數"}

    # 🌟 核心升級：加入最強級別的「分類約束與防呆警告」
    prompt = f"""
    你是一個專業的香港社會福利政策分析專家。請分析以下新聞標題，並嚴格以 JSON 格式回傳結果。
    新聞標題：「{title}」

    【分類指引與嚴格警告】
    請根據標題內容，從以下 10 個類別中挑選「最精確」的一個。
    ⚠️ 絕對警告：回傳的 `type` 欄位「必須」完全照抄以下 10 個選項中的其中一個字串，連一個標點符號或字眼都不准改！絕對不可以自己發明新分類（例如不可用「兒童保護」，必須用「家庭及兒童」；不可用「精神健康」，必須用「醫療與精神健康」）！
    
    1. "安老服務" (包含：長者、安老院、護老、樂悠咭、銀髮、醫療券)
    2. "青少年服務" (包含：青年發展、學生、童軍、青年宿舍、DSE)
    3. "復康服務" (包含：殘疾人士、特殊需要、自閉症、無障礙、庇護工場、SEN)
    4. "家庭及兒童" (包含：虐童、家暴、托兒、家長支援、保護兒童、兒童保護、單親)
    5. "社區發展" (包含：關愛隊、社區中心、鄰舍、地區治理、劏房、過渡性房屋、房屋支援)
    6. "社會保障" (包含：綜援、津貼、生果金、長者生活津貼、扶貧、派糖、預算案、經濟政策)
    7. "勞工及就業" (包含：最低工資、外傭、職安健、失業支援、人才、打工仔)
    8. "醫療與精神健康" (包含：醫院、精神病、情緒支援、社康護理、抑鬱、精神健康)
    9. "少數族裔支援" (包含：南亞裔、翻譯服務、種族融和、非華語)
    10. "其他社福" (只有在上述 9 項完全不符合時才使用)

    回傳 JSON 格式要求：
    {{
        "is_social_welfare": boolean, // 判斷是否為香港社福/民生/弱勢群體相關新聞。純廣告、商業旅遊、娛樂設為 false。
        "type": string, // 必須完全照抄上述 10 個選項的其中一個名稱！
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
        "response_format": {"type": "json_object"},
        "stream": False
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}"
    }

    # API 頻率限制 (Rate Limit) 的重試機制
    for attempt in range(3):
        try:
            response = requests.post(DEEPSEEK_URL, headers=headers, json=payload, timeout=25)
            
            # 遇到 429 請求太快，休息 5 秒再試
            if response.status_code == 429:
                print(f"⚠️ API 頻率過高，暫停 5 秒... (第 {attempt+1} 次重試)")
                time.sleep(5)
                continue
                
            response.raise_for_status()
            return json.loads(response.json()['choices'][0]['message']['content'])
            
        except Exception as e:
            print(f"DeepSeek 分析失敗 (嘗試 {attempt+1}/3): {e}")
            time.sleep(3) 
            
    return {"error": "API 連續失敗"}

# --- 資料庫工具函數 ---
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

def parse_date(date_str):
    try:
        dt = parsedate_to_datetime(date_str)
        return dt.strftime("%Y-%m-%d")
    except Exception as e:
        return datetime.date.today().isoformat()

# ==========================================================
# 🕷️ 背景抓取核心任務
# ==========================================================
SEARCH_KEYWORDS = ["香港 社福", "香港 安老服務", "香港 綜援", "香港 社會福利署", "香港 照顧者支援"]
is_updating = False

def fetch_news_task():
    data = load_db() or []
    seen_links = set(item['link'] for item in data)
    
    process_limit = 150 # 解除上限，足以應付每天的所有新聞
    count = 0
    consecutive_errors = 0 
    
    print("🚀 [DeepSeek Engine] 正在以穩定模式掃描最新新聞...")
    blacklist = ["酒店", "自助餐", "旅遊", "娛樂城", "金沙", "博彩", "賭場", "著數", "優惠碼"]

    for kw in SEARCH_KEYWORDS:
        if count >= process_limit: break
        
        # 強制只搜尋過去 48 小時
        query = f"{kw} when:2d"
        url = f"https://news.google.com/rss/search?q={urllib.parse.quote(query)}&hl=zh-HK&gl=HK&ceid=HK:zh-Hant"
        
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
                
                # 強制呼吸機制：每處理一篇停頓 2 秒
                time.sleep(2)
                
                if ai_result and "error" not in ai_result:
                    consecutive_errors = 0 
                    
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
                else:
                    consecutive_errors += 1
                    print(f"❌ 累積失敗 {consecutive_errors} 次: 可能是 API 餘額耗盡或被鎖")
                    
                    # 斷路器：連續失敗 5 次即停止
                    if consecutive_errors >= 5:
                        print("🛑 觸發系統保護：連續失敗 5 次，強制結束本次更新！")
                        data.sort(key=lambda x: x['date'], reverse=True)
                        save_db(data)
                        return
                        
        except Exception as e: 
            print(f"Error fetching {kw}: {e}")
            continue
            
    data.sort(key=lambda x: x['date'], reverse=True)
    save_db(data)
    print(f"✅ 更新完畢！本次穩定新增了 {count} 筆。")

def background_thread():
    global is_updating
    is_updating = True
    try: fetch_news_task()
    finally: is_updating = False

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

@app.route('/')
def home():
    engine = "DeepSeek-V3 (Strict Category Enforcement)"
    status = "⚠️ 更新中" if is_updating else "✅ 待命"
    return f"<h3>Social News API Status</h3>Engine: {engine}<br>Status: {status}"

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)

