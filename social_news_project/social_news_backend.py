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
import threading  # 用於背景執行緒，讓網頁秒速載入

# 匯入 Google Gemini API 套件
import google.generativeai as genai

# 初始化 Flask 應用
app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False
CORS(app)

# --- [關鍵設定] 系統參數與環境變數 ---
DB_FILE = "/data/news_db.json"
CACHE_DURATION = 3600 * 6  # 6 小時更新一次

# 預先初始化 jieba (作為 AI 失敗時的備用方案)
jieba.initialize()

# 設定 Gemini API
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    # 強制 Gemini 回傳 JSON 格式
    generation_config = {"response_mime_type": "application/json"}
    # 使用 2.5 flash 模型，速度快且免費額度高
    gemini_model = genai.GenerativeModel('gemini-2.5-flash', generation_config=generation_config)
    print("✅ Gemini AI 引擎已啟動！")
else:
    gemini_model = None
    print("⚠️ 未偵測到 GEMINI_API_KEY，將使用傳統演算法運作。")

SEARCH_KEYWORDS = [
    "香港 社福", "香港 安老院 服務", "香港 青少年 中心", "香港 社工", 
    "香港 殘疾人士 津貼", "香港 照顧者 支援", "香港 過渡性房屋", 
    "香港 綜援 金額", "香港 樂齡科技", "香港 精神健康 支援",
    "香港 劏房 支援", "香港 社區客廳", "香港 扶貧 政策", 
    "香港 兒童 保護", "香港 虐兒 關注", "香港 托兒 服務", "香港 單親 支援",
    "香港 SEN 學童", "香港 少數族裔 福利", "香港 關愛隊", 
    "香港 居家安老", "香港 長者 醫療券"
]

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)'
}

# 全域變數：用來記錄目前是否「正在背景更新中」，避免重複觸發
is_updating = False

# ==========================================================
# 🧠 核心：Gemini AI 綜合分析引擎
# ==========================================================
def analyze_with_gemini(title):
    if not gemini_model:
        return None
        
    prompt = f"""
    你是一個專業的香港社福政策與新聞分析專家。請分析以下新聞標題，並以 JSON 格式回傳。
    新聞標題：「{title}」

    請嚴格遵守以下 JSON 格式回傳：
    {{
        "is_social_welfare": boolean, // 判斷這是否真的是關於香港社會福利、政策、基層民生、弱勢社群的新聞。如果是吃喝玩樂、旅遊酒店推介、無關的商業廣告請設為 false。
        "type": string, // 必須是以下之一：'安老服務', '青少年服務', '復康服務', '家庭及兒童', '社區發展', '社會保障', '勞工及就業', '醫療與精神健康', '少數族裔支援', '其他社福'
        "sentiment": float, // 情緒極性：-1.0 (極度負面/悲劇/社會慘案) 到 1.0 (極度正面/惠民政策/撥款增加)。客觀的政策推行通常為 0.2 到 0.6。
        "emotions": {{
            "joy": float, // 0.0 到 1.0
            "sadness": float,
            "trust": float, // 政府政策、社福機構通常具有較高的 trust
            "anticipation": float,
            "anger": float,
            "fear": float
        }},
        "keywords": [string, string, string, string, string] // 請提取 5 個精準的關鍵字 (不含'香港'或'新聞')
    }}
    """
    try:
        response = gemini_model.generate_content(prompt)
        data = json.loads(response.text)
        return data
    except Exception as e:
        print(f"Gemini API 分析失敗，自動切換至傳統演算法: {e}")
        return None

# ==========================================================
# 備用：傳統演算法 (當 AI 異常時自動接手)
# ==========================================================
def fallback_analyze_sentiment(text):
    try:
        s = SnowNLP(text)
        base_score = (s.sentiments - 0.5) * 2
        positive_keywords = ['優惠', '津貼', '支援', '資助', '免費', '受惠', '推介', '撥款', '改善', '增加', '福利', '預算案', '經濟', '發展', '民生', '轉虧為盈', '穩中求進', '社區', '創科', '建設', '進步', '聚焦', '引路', '共融', '關愛', '復甦', '紓困']
        negative_keywords = ['虐兒', '家暴', '慘劇', '意外', '倒閉', '失業', '悲劇', '裁員', '騙案', '被捕', '死亡', '罪案', '非禮', '自殺', '破產']
        if any(k in text for k in positive_keywords): base_score += 1.2  
        if any(k in text for k in negative_keywords): base_score -= 1.0  
        return round(max(-1.0, min(1.0, base_score)), 2)
    except: return 0

def fallback_classify_service_type(text):
    text = text.lower()
    if any(k in text for k in ['精神', '情緒', '抑鬱', '醫療', '輔導', '心理', '健康']): return '醫療與精神健康'
    elif any(k in text for k in ['勞工', '就業', '失業', '職安', '強積金', '最低工資', '打工仔', '僱員']): return '勞工及就業'
    elif any(k in text for k in ['少數族裔', '非華語', '南亞裔', '新移民', '新來港']): return '少數族裔支援'
    elif any(k in text for k in ['老人', '長者', '安老', '認知障礙', '樂齡', '護老', '銀髮']): return '安老服務'
    elif any(k in text for k in ['青年', '學生', '童軍', '外展', '學童', '青少年', 'dse']): return '青少年服務'
    elif any(k in text for k in ['殘疾', '康復', '無障礙', '智障', '特殊教育', 'sen', '展能']): return '復康服務'
    elif any(k in text for k in ['綜援', '津貼', '福利金', '財政預算', '施政報告', '扶貧', '派糖']): return '社會保障'
    elif any(k in text for k in ['家庭', '虐兒', '親子', '婦女', '幼兒', '家暴', '托兒']): return '家庭及兒童'
    elif any(k in text for k in ['房屋', '劏房', '社區', '關愛隊', '公屋', '基層', '無家者']): return '社區發展'
    else: return '其他社福'

# --- 基礎資料庫邏輯 ---
def parse_google_date(pub_date_str):
    formats = ["%a, %d %b %Y %H:%M:%S %Z", "%Y-%m-%d", "%d %b %Y"]
    for fmt in formats:
        try:
            struct_time = time.strptime(pub_date_str, fmt)
            return time.strftime("%Y-%m-%d", struct_time)
        except ValueError: continue
    return datetime.date.today().isoformat()

def load_db():
    local_fallback_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "news_db.json")
    if os.path.exists(local_fallback_path):
        local_size = os.path.getsize(local_fallback_path)
        disk_size = os.path.getsize(DB_FILE) if os.path.exists(DB_FILE) else 0
        if disk_size == 0 or local_size > (disk_size + 102400):
            try:
                if not os.path.exists("/data"): os.makedirs("/data", exist_ok=True)
                shutil.copy(local_fallback_path, DB_FILE)
            except: pass
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r', encoding='utf-8') as f: return json.load(f)
        except: return None
    return []

def save_db(data):
    try:
        if not os.path.exists("/data"): os.makedirs("/data", exist_ok=True)
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except: pass

# ==========================================================
# 爬蟲主程式 (已加入 API 速率限制保護)
# ==========================================================
def fetch_google_news_rss():
    existing_data = load_db() or []
    seen_links = set(item['link'] for item in existing_data)
    
    today = datetime.date.today()
    one_week_ago = today - datetime.timedelta(days=7)
    date_filter = f"after:{one_week_ago.isoformat()}"

    print(f"啟動智慧爬蟲 (時間範圍: {one_week_ago} 之後)...")
    new_items_count = 0
    
    # 【關鍵防護】每次背景更新最多只處理 15 篇，保護 API 額度與伺服器效能
    max_process_limit = 15 
    
    for keyword in SEARCH_KEYWORDS:
        if new_items_count >= max_process_limit:
            print("達到單次處理上限，為保護伺服器與 API 額度提早結束。未處理新聞將於下次繼續。")
            break
            
        query = f"{keyword} {date_filter}"
        url = f"https://news.google.com/rss/search?q={urllib.parse.quote(query)}&hl=zh-HK&gl=HK&ceid=HK:zh-Hant"
        try:
            response = requests.get(url, headers=HEADERS, timeout=15)
            soup = BeautifulSoup(response.content, features='xml')
            items = soup.findAll('item')
            
            for item in items:
                if new_items_count >= max_process_limit:
                    break
                    
                link = item.link.text
                if link in seen_links: continue
                title = item.title.text
                
                # ==========================================
                # 🚀 透過 Gemini AI 進行一站式分析
                # ==========================================
                ai_data = analyze_with_gemini(title)
                
                if ai_data:
                    # 智慧過濾：如果是非社福新聞，直接捨棄！
                    if not ai_data.get("is_social_welfare", True):
                        print(f"🗑️ AI 過濾無關新聞: {title}")
                        seen_links.add(link) 
                        continue
                        
                    news_type = ai_data.get("type", "其他社福")
                    sentiment = ai_data.get("sentiment", 0.0)
                    emotions = ai_data.get("emotions", {
                        "joy": 0.1, "sadness": 0.1, "trust": 0.5, "anticipation": 0.5, "anger": 0.1, "fear": 0.1
                    })
                    keywords = ai_data.get("keywords", [])
                else:
                    # 如果 AI 失敗，自動切回傳統備用方案
                    exclude_words = ["酒店", "自助餐", "旅遊", "打卡", "演唱會"]
                    if any(w in title for w in exclude_words): 
                        seen_links.add(link)
                        continue
                        
                    news_type = fallback_classify_service_type(title)
                    sentiment = fallback_analyze_sentiment(title)
                    emotions = {
                        "joy": random.uniform(0.1, 0.8) if sentiment > 0 else 0.1,
                        "sadness": random.uniform(0.1, 0.8) if sentiment < 0 else 0.1,
                        "trust": random.uniform(0.3, 0.7),
                        "anticipation": random.uniform(0.2, 0.6),
                        "anger": random.uniform(0, 0.3),
                        "fear": random.uniform(0, 0.2)
                    }
                    try: keywords = jieba.analyse.extract_tags(title, topK=5)
                    except: keywords = []
                # ==========================================

                seen_links.add(link)
                new_items_count += 1
                date_str = parse_google_date(item.pubDate.text)
                
                existing_data.append({
                    "id": f"news-{int(time.time()*1000)}-{random.randint(0, 1000)}",
                    "date": date_str,
                    "type": news_type,
                    "sentiment": round(sentiment, 2),
                    "emotions": emotions,
                    "title": title,
                    "keywords": keywords,
                    "link": link
                })
                
                # 【關鍵防護】強制限速：每處理完一篇等待 4.5 秒 (防 429 Error)
                print(f"待機中... (API速率限制保護: 4.5秒)")
                time.sleep(4.5)

        except Exception as e:
            print(f"抓取 {keyword} 時發生錯誤: {e}")
            continue
            
    existing_data.sort(key=lambda x: x['date'], reverse=True)
    save_db(existing_data)
    print(f"更新完成！本次新增 {new_items_count} 筆。")
    return existing_data

# ==========================================================
# 【新增】背景執行緒包裝函數 (附帶安全解鎖機制)
# ==========================================================
def background_update_task():
    global is_updating
    is_updating = True
    print("啟動背景非同步更新執行緒...")
    try:
        fetch_google_news_rss()
    except Exception as e:
        print(f"背景更新發生嚴重錯誤: {e}")
    finally:
        # 無論成功或失敗，最後一定要解開鎖定，確保下次可以再觸發
        is_updating = False
        print("背景執行緒已結束，安全鎖已釋放。")

# ==========================================================
# API 路由
# ==========================================================
@app.route('/api/news-data', methods=['GET'])
def get_news_data():
    global is_updating
    data = load_db() or []
    should_update = False
    
    if len(data) == 0:
        should_update = True
    else:
        try:
            if (time.time() - os.path.getmtime(DB_FILE)) > CACHE_DURATION:
                should_update = True
        except: 
            should_update = True
            
    # 【關鍵修改】如果需要更新，且目前沒有其他執行緒在更新中
    if should_update and not is_updating:
        print("觸發背景自動更新！(使用者將立即收到歷史資料，無須等待)")
        # 建立並啟動背景執行緒去跑爬蟲與 AI，不卡住前端的回應
        thread = threading.Thread(target=background_update_task)
        thread.start()
        
    # 直接「秒速」回傳現有的資料庫內容給讀者
    return jsonify(data)

@app.route('/')
def home():
    status = "Gemini AI" if gemini_model else "傳統算法 (SnowNLP)"
    updating_status = " (背景正在抓取最新資料中...)" if is_updating else " (待命狀態)"
    return f"Social News Analysis API is running.<br>Current Engine: {status}<br>Status: {updating_status}"

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
