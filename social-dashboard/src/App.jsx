import React, { useState, useEffect, useMemo } from 'react';
import { 
  ComposedChart, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, Area, AreaChart, ReferenceLine
} from 'recharts';
import { LayoutDashboard, FileText, Activity, Cloud, Search, TrendingUp, TrendingDown, Clock, Layers, Table as TableIcon, LineChart as LineChartIcon, MousePointerClick, RefreshCcw, ChevronDown, CalendarDays, AlertCircle, CheckCircle2, RefreshCw, Database, BarChart2, PieChart as PieChartIcon } from 'lucide-react';

// --- 1. 模擬數據生成邏輯 (作為備用方案/Fallback) ---

const SERVICE_TYPES = ['安老服務', '青少年服務', '復康服務', '家庭及兒童', '社區發展', '社會保障', '勞工及就業', '醫療與精神健康', '少數族裔支援'];
const SERVICE_COLORS = {
  '安老服務': '#8884d8',
  '青少年服務': '#82ca9d',
  '復康服務': '#ffc658',
  '家庭及兒童': '#ff8042',
  '社區發展': '#0088fe',
  '社會保障': '#00c49f',
  '勞工及就業': '#14b8a6', // Teal 藍綠色
  '醫療與精神健康': '#8b5cf6', // Violet 紫色
  '少數族裔支援': '#f43f5e', // Rose 玫瑰紅
  '其他社福': '#94a3b8' // 清晰的岩灰色
};

const KEYWORDS_BASE = {
  '安老服務': ['長者', '安老院', '樂齡科技', '獨居', '照顧者', '認知障礙', '醫療券'],
  '青少年服務': ['學生', '情緒健康', '生涯規劃', '外展', '童軍', '網癮', '青年宿舍'],
  '復康服務': ['殘疾人士', '共融', '庇護工場', '無障礙', '康復'],
  '家庭及兒童': ['虐兒', '寄養', '單親', '家庭關係', '社工', '保護兒童'],
  '社區發展': ['過渡性房屋', '關愛隊', '社區客廳', '扶貧', '基層', '劏房'],
  '社會保障': ['綜援', '高齡津貼', '施政報告', '財政預算案', '福利金'],
  '勞工及就業': ['就業', '失業', '強積金', '最低工資', '職安'],
  '醫療與精神健康': ['精神', '情緒', '抑鬱', '輔導', '心理'],
  '少數族裔支援': ['少數族裔', '非華語', '南亞裔', '新來港']
};

const generateMockData = (days = 1825) => {
  const data = [];
  const endDate = new Date();
  
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(endDate.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const newsCount = Math.floor(Math.random() * 5) + 1; 
    
    for (let j = 0; j < newsCount; j++) {
      let typeIndex = Math.floor(Math.random() * SERVICE_TYPES.length);
      if (date.getDate() < 5 && Math.random() > 0.6) typeIndex = 5; 
      const type = SERVICE_TYPES[typeIndex];
      let baseSentiment = (Math.random() * 2) - 0.85; 
      if (type === '安老服務') baseSentiment += 0.3; 
      if (type === '青少年服務') baseSentiment += 0.1;
      if (type === '社會保障') baseSentiment -= 0.2; 
      const sentiment = Math.max(-1, Math.min(1, baseSentiment));
      const isPositive = sentiment > 0;
      
      const emotions = {
        joy: isPositive ? Math.random() * 0.6 + 0.3 : Math.random() * 0.2,
        trust: isPositive ? Math.random() * 0.5 + 0.3 : Math.random() * 0.3,
        anticipation: Math.random() * 0.6 + 0.1,
        sadness: !isPositive ? Math.random() * 0.6 + 0.3 : Math.random() * 0.2,
        anger: !isPositive ? Math.random() * 0.5 + 0.1 : Math.random() * 0.1,
        fear: !isPositive ? Math.random() * 0.4 + 0.1 : Math.random() * 0.1,
      };

      const possibleKeywords = KEYWORDS_BASE[type] || ['社福'];
      const keywords = [];
      const numKeywords = Math.floor(Math.random() * 3) + 2;
      for(let k=0; k<numKeywords; k++) {
        keywords.push(possibleKeywords[Math.floor(Math.random() * possibleKeywords.length)]);
      }

      data.push({
        id: `${dateStr}-${j}`,
        date: dateStr,
        type: type,
        sentiment: sentiment,
        emotions: emotions,
        title: `關於${type}的相關報導 - ${keywords[0]}`,
        keywords: keywords
      });
    }
  }
  return data;
};

// --- 2. 輔助組件 ---

const Card = ({ children, className = "" }) => (
  <div className={`bg-white p-6 rounded-xl shadow-sm border border-slate-200 ${className}`}>
    {children}
  </div>
);

const StatCard = ({ title, value, subtext, icon: Icon, colorClass }) => (
  <Card>
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-slate-500 text-sm font-medium">{title}</h3>
      <div className={`p-2 rounded-lg ${colorClass} bg-opacity-10`}>
        <Icon size={20} className={colorClass.replace('bg-', 'text-')} />
      </div>
    </div>
    <div className="text-2xl font-bold text-slate-800">{value}</div>
    <p className="text-xs text-slate-400 mt-1">{subtext}</p>
  </Card>
);

const TimeUnitSelector = ({ value, onChange }) => (
  <div className="flex bg-slate-100 p-1 rounded-lg">
    <button onClick={() => onChange('day')} className={`px-2 py-1 text-xs rounded-md transition-all ${value === 'day' ? 'bg-white text-slate-800 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}>日</button>
    <button onClick={() => onChange('week')} className={`px-2 py-1 text-xs rounded-md transition-all ${value === 'week' ? 'bg-white text-slate-800 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}>週</button>
    <button onClick={() => onChange('month')} className={`px-2 py-1 text-xs rounded-md transition-all ${value === 'month' ? 'bg-white text-slate-800 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}>月</button>
  </div>
);

const SimpleWordCloud = ({ words, selectedWords, onWordClick }) => {
  if (!words || words.length === 0) return <div className="text-center text-slate-400 py-10">無足夠數據</div>;
  const maxVal = Math.max(...words.map(w => w.value));
  
  return (
    <div className="flex flex-wrap gap-3 justify-start items-center content-start">
      {words.map((word, idx) => {
        const isSelected = selectedWords.includes(word.text);
        const size = 12 + (word.value / maxVal) * 20; 
        const opacity = isSelected ? 1 : 0.6;
        
        const colors = ['text-blue-600', 'text-emerald-600', 'text-indigo-600', 'text-rose-500', 'text-amber-600'];
        const baseColor = colors[idx % colors.length];
        
        return (
          <button 
            key={idx} 
            onClick={() => onWordClick(word.text)}
            className={`
              transition-all cursor-pointer select-none px-4 py-2 rounded-full border leading-none
              ${isSelected 
                ? `bg-blue-50 ${baseColor} border-blue-300 shadow-md scale-105 font-bold z-10` 
                : `bg-white border-slate-200 ${baseColor} hover:bg-slate-50 hover:border-slate-300 font-medium`
              }
            `}
            style={{ fontSize: `${size}px`, opacity }}
            title={`點擊以在下方圖表顯示趨勢 (次數: ${word.value})`}
          >
            {word.text}
          </button>
        );
      })}
    </div>
  );
};

// --- 3. 主應用程式 ---

export default function SocialServiceDashboard() {
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState('connecting'); 
  const [connectionError, setConnectionError] = useState(''); 
  
  // 全域：篩選設定
  const [globalDateRange, setGlobalDateRange] = useState('1_year'); 
  const [globalStartDate, setGlobalStartDate] = useState('');
  const [globalEndDate, setGlobalEndDate] = useState('');
  
  // 顯示模式設定
  const [chartMode, setChartMode] = useState('overview'); // 'overview', 'general_emotion', 'emotions'
  const [viewMode, setViewMode] = useState('chart'); 
  
  // 各圖表的獨立分析單位
  const [timeUnitOverview, setTimeUnitOverview] = useState('month'); 
  const [timeUnitService, setTimeUnitService] = useState('month');
  const [timeUnitKeyword, setTimeUnitKeyword] = useState('month');
  
  // 關鍵字設定
  const [selectedKeywords, setSelectedKeywords] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    setDataSource('connecting');
    setConnectionError('');
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); 

      // 請求 Render 上面的 API
      const response = await fetch('https://socialwelfaremedia.onrender.com/api/news-data', {
          signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
          throw new Error(`HTTP 錯誤! 狀態碼: ${response.status}`);
      }
      
      const realData = await response.json();
      
      if (Array.isArray(realData) && realData.length > 0) {
          setRawData(realData);
          setDataSource('real');
      } else {
          setConnectionError("連線成功，但目前資料庫為空");
          setRawData(generateMockData(1825));
          setDataSource('empty'); 
      }

    } catch (error) {
      let msg = "未知錯誤";
      if (error.name === 'AbortError') msg = "連線逾時 (後端回應太慢或正在啟動中)";
      else msg = error.message;
      
      setConnectionError(msg);
      setRawData(generateMockData(1825)); 
      setDataSource('mock');
    } finally {
      setLoading(false);
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      setGlobalStartDate(start.toISOString().split('T')[0]);
      setGlobalEndDate(end.toISOString().split('T')[0]);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredData = useMemo(() => {
    if (!rawData.length) return [];
    
    if (globalDateRange === 'custom') {
        if (!globalStartDate || !globalEndDate) return rawData;
        const start = new Date(globalStartDate);
        const end = new Date(globalEndDate);
        end.setHours(23, 59, 59, 999); 
        return rawData.filter(d => {
            const itemDate = new Date(d.date);
            return itemDate >= start && itemDate <= end;
        });
    }

    const now = new Date();
    const cutoff = new Date();
    
    switch(globalDateRange) {
        case '7_days': cutoff.setDate(now.getDate() - 7); break;
        case '1_month': cutoff.setMonth(now.getMonth() - 1); break;
        case '3_months': cutoff.setMonth(now.getMonth() - 3); break;
        case '6_months': cutoff.setMonth(now.getMonth() - 6); break;
        case '1_year': cutoff.setFullYear(now.getFullYear() - 1); break;
        case '3_years': cutoff.setFullYear(now.getFullYear() - 3); break;
        case '5_years': cutoff.setFullYear(now.getFullYear() - 5); break;
        default: cutoff.setFullYear(now.getFullYear() - 1);
    }
    
    return rawData.filter(d => new Date(d.date) >= cutoff);
  }, [rawData, globalDateRange, globalStartDate, globalEndDate]);


  const groupByTime = (data, unit) => {
    const getWeekStr = (dateObj) => {
        const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
        return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
    };

    const getWeekRange = (year, week) => {
        const d = new Date(year, 0, 1 + (week - 1) * 7);
        const start = d;
        const end = new Date(d);
        end.setDate(d.getDate() + 6);
        return `${start.getFullYear()}/${start.getMonth()+1}/${start.getDate()} - ${end.getMonth()+1}/${end.getDate()}`;
    };

    const grouped = {};

    data.forEach(item => {
      const dateObj = new Date(item.date);
      let key, displayLabel, rangeTooltip;

      if (unit === 'month') {
        key = item.date.substring(0, 7); 
        displayLabel = key; 
        rangeTooltip = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月`;
      } else if (unit === 'week') {
        key = getWeekStr(dateObj); 
        displayLabel = key; 
        const [y, w] = key.split('-W');
        rangeTooltip = `${key} (${getWeekRange(y, parseInt(w))})`;
      } else {
        key = item.date; 
        displayLabel = key; 
        rangeTooltip = key;
      }

      if (!grouped[key]) {
        grouped[key] = { key, displayLabel, rangeTooltip, items: [], rawDate: dateObj };
      }
      grouped[key].items.push(item);
    });
    
    return Object.values(grouped).sort((a, b) => a.rawDate - b.rawDate);
  };

  const chartDataOverview = useMemo(() => {
    const grouped = groupByTime(filteredData, timeUnitOverview);
    return grouped.map(group => {
      const count = group.items.length;
      const totalSentiment = group.items.reduce((acc, curr) => acc + curr.sentiment, 0);
      
      const emotions = { joy: 0, trust: 0, anticipation: 0, sadness: 0, anger: 0, fear: 0 };
      group.items.forEach(item => {
        if(item.emotions) {
            emotions.joy += (item.emotions.joy || 0);
            emotions.trust += (item.emotions.trust || 0);
            emotions.anticipation += (item.emotions.anticipation || 0);
            emotions.sadness += (item.emotions.sadness || 0);
            emotions.anger += (item.emotions.anger || 0);
            emotions.fear += (item.emotions.fear || 0);
        }
      });

      return {
        name: group.displayLabel,
        fullLabel: group.rangeTooltip,
        count,
        avgSentiment: parseFloat((totalSentiment / count).toFixed(2)),
        joy: parseFloat((emotions.joy / count).toFixed(2)),
        trust: parseFloat((emotions.trust / count).toFixed(2)),
        anticipation: parseFloat((emotions.anticipation / count).toFixed(2)),
        sadness: parseFloat((emotions.sadness / count).toFixed(2)),
        anger: parseFloat((emotions.anger / count).toFixed(2)),
        fear: parseFloat((emotions.fear / count).toFixed(2)),
      };
    });
  }, [filteredData, timeUnitOverview]);

  const serviceTrendData = useMemo(() => {
    const grouped = groupByTime(filteredData, timeUnitService);
    return grouped.map(group => {
      const counts = { name: group.displayLabel, fullLabel: group.rangeTooltip };
      Object.keys(SERVICE_COLORS).forEach(t => counts[t] = 0);
      
      group.items.forEach(item => {
        const type = SERVICE_COLORS[item.type] ? item.type : '其他社福';
        counts[type]++;
      });
      return counts;
    });
  }, [filteredData, timeUnitService]);

  const keywordData = useMemo(() => {
    const totalStats = {};
    
    filteredData.forEach(item => {
      const stopWords = ['香港', '社福', '服務', '報導', '相關']; 
      item.keywords.forEach(kw => {
        if (!stopWords.includes(kw)) {
            totalStats[kw] = (totalStats[kw] || 0) + 1;
        }
      });
    });
    
    const sortedKeywords = Object.keys(totalStats)
      .map(key => ({ text: key, value: totalStats[key] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 50);
    
    const top5 = sortedKeywords.slice(0, 5).map(k => k.text);
    
    const grouped = groupByTime(filteredData, timeUnitKeyword);
    const trackableKeywords = sortedKeywords.map(k => k.text);

    const trendData = grouped.map(group => {
      const entry = { name: group.displayLabel, fullLabel: group.rangeTooltip };
      trackableKeywords.forEach(kw => entry[kw] = 0);
      group.items.forEach(item => {
        item.keywords.forEach(kw => {
          if (trackableKeywords.includes(kw)) entry[kw]++;
        });
      });
      return entry;
    });

    return {
      cloudData: sortedKeywords,
      trendData: trendData,
      defaultTop5: top5
    };
  }, [filteredData, timeUnitKeyword]);

  useEffect(() => {
    if (keywordData.defaultTop5.length > 0) {
        setSelectedKeywords(keywordData.defaultTop5);
    } else {
        setSelectedKeywords([]);
    }
  }, [keywordData.defaultTop5]);

  const handleKeywordClick = (word) => {
    setSelectedKeywords(prev => {
      if (prev.includes(word)) return prev.filter(w => w !== word);
      else if (prev.length >= 8) return prev; 
      else return [...prev, word];
    });
  };

  const typeStats = useMemo(() => {
    const stats = {};
    filteredData.forEach(item => {
      const type = SERVICE_COLORS[item.type] ? item.type : '其他社福';
      stats[type] = (stats[type] || 0) + 1;
    });
    return Object.keys(stats).map(key => ({
      name: key,
      value: stats[key]
    })).sort((a, b) => b.value - a.value);
  }, [filteredData]);

  const overallSentiment = useMemo(() => {
    if (filteredData.length === 0) return 0;
    const sum = filteredData.reduce((acc, curr) => acc + curr.sentiment, 0);
    const avg = sum / filteredData.length;
    if (Math.abs(avg) < 0.005) return "0.00";
    return avg.toFixed(2);
  }, [filteredData]);

  const KEYWORD_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
  ];

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-slate-500">正在連接數據分析引擎...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      
      {/* 頂部 Header */}
      <header className="mb-8 flex flex-col xl:flex-row xl:items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
            <LayoutDashboard className="text-blue-600" />
            社福新聞輿情分析系統
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <p className="text-slate-500 text-sm mr-2">全方位動態追蹤 • 趨勢視覺化</p>
            
            <div className={`group relative text-xs px-2 py-1 rounded-full flex items-center gap-1 cursor-help ${dataSource === 'real' ? 'bg-green-100 text-green-700' : dataSource === 'empty' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                {dataSource === 'real' ? <CheckCircle2 size={12}/> : dataSource === 'empty' ? <Database size={12}/> : <AlertCircle size={12}/>}
                <span>
                  {dataSource === 'real' ? `已連線 (資料筆數: ${rawData.length})` 
                   : dataSource === 'empty' ? '已連線 (資料庫為空)' 
                   : '演示模式 (備用數據)'}
                </span>
                
                {dataSource !== 'real' && (
                  <div className="absolute left-0 top-full mt-1 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                    <p className="font-bold mb-1">系統訊息：</p>
                    <p>{connectionError}</p>
                  </div>
                )}
            </div>
            
            <button 
              onClick={fetchData} 
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded border border-blue-200 hover:bg-blue-50 transition-colors"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              {loading ? "連線中..." : "重新抓取"}
            </button>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-2 bg-white p-3 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-700 flex items-center gap-1">
                  <Clock size={16} className="text-blue-500" /> 分析區間設定:
                </span>
                
                <select
                  value={globalDateRange !== 'custom' ? globalDateRange : 'custom'}
                  onChange={(e) => setGlobalDateRange(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <option value="7_days">過去 7 天</option>
                  <option value="1_month">過去 1 個月</option>
                  <option value="3_months">過去 3 個月</option>
                  <option value="6_months">過去 6 個月</option>
                  <option value="1_year">過去 1 年</option>
                  <option value="3_years">過去 3 年</option>
                  <option value="5_years">過去 5 年</option>
                  <option disabled>──────────</option>
                  <option value="custom">自訂日期範圍...</option>
                </select>
            </div>

            {globalDateRange === 'custom' && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 w-full justify-end">
                    <span className="text-xs text-slate-400">從</span>
                    <input 
                        type="date" 
                        value={globalStartDate} 
                        onChange={(e) => setGlobalStartDate(e.target.value)}
                        className="px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500 text-slate-700 bg-slate-50"
                    />
                    <span className="text-xs text-slate-400">至</span>
                    <input 
                        type="date" 
                        value={globalEndDate} 
                        onChange={(e) => setGlobalEndDate(e.target.value)}
                        className="px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500 text-slate-700 bg-slate-50"
                    />
                </div>
            )}
        </div>
      </header>

      {/* ==========================================================
          區塊 1：關鍵指標 (2x2) 與 類別總體分佈 (圓餅圖)
          ========================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <StatCard title="分析文章總數" value={filteredData.length} subtext="基於所選分析區間" icon={FileText} colorClass="bg-blue-500 text-blue-500" />
          <StatCard title="綜合情緒指數" value={parseFloat(overallSentiment) > 0 ? `+${overallSentiment}` : overallSentiment} subtext="一維極性 (-1 ~ +1)" icon={parseFloat(overallSentiment) >= 0 ? TrendingUp : TrendingDown} colorClass={parseFloat(overallSentiment) >= 0 ? "bg-emerald-500 text-emerald-500" : "bg-rose-500 text-rose-500"} />
          <StatCard title="最關注議題" value={typeStats[0]?.name || "N/A"} subtext="報導量最高類別" icon={Activity} colorClass="bg-purple-500 text-purple-500" />
          <StatCard title="核心關鍵字" value={keywordData.cloudData[0]?.text || "N/A"} subtext="出現頻次最高" icon={Search} colorClass="bg-amber-500 text-amber-500" />
        </div>

        <Card className="flex flex-col h-full min-h-[300px]">
          <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">
            <PieChartIcon size={20} className="text-blue-600" />
            類別總體分佈
          </h2>
          <div className="flex-1 w-full relative min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typeStats} cx="50%" cy="45%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value"
                >
                  {typeStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={SERVICE_COLORS[entry.name]} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend 
                  layout="horizontal" 
                  verticalAlign="bottom" 
                  align="center" 
                  wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} 
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute top-[45%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
              <div className="text-xl font-bold text-slate-700">{filteredData.length}</div>
              <div className="text-[10px] text-slate-400">總篇數</div>
            </div>
          </div>
        </Card>
      </div>

      {/* ==========================================================
          區塊 2：輿情線性分析 (100% 滿版寬度)
          ========================================================== */}
      <Card className="flex flex-col h-[450px] mb-6">
        <div className="flex flex-col xl:flex-row justify-between xl:items-start gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Activity size={20} className="text-blue-600" />
              輿情線性分析
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {viewMode === 'table' ? '查看原始數據' : (chartMode === 'overview' ? '顯示: 總體報導聲量' : chartMode === 'general_emotion' ? '顯示: 綜合情緒極性走勢 (-1 到 1)' : '顯示: 六大情緒維度變化')}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
              <div className="flex items-center gap-2 border-r border-slate-200 pr-3">
                <span className="text-xs text-slate-400">分析單位:</span>
                <TimeUnitSelector value={timeUnitOverview} onChange={setTimeUnitOverview} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button onClick={() => setViewMode('chart')} className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-all ${viewMode === 'chart' ? 'bg-white text-slate-800 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}>
                    <LineChartIcon size={12}/> 圖表
                  </button>
                  <button onClick={() => setViewMode('table')} className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-all ${viewMode === 'table' ? 'bg-white text-slate-800 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}>
                    <TableIcon size={12}/> 列表
                  </button>
                </div>

                {viewMode === 'chart' && (
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setChartMode('overview')} className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-all ${chartMode === 'overview' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}>
                      <Layers size={12}/> 聲量
                    </button>
                    <button onClick={() => setChartMode('general_emotion')} className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-all ${chartMode === 'general_emotion' ? 'bg-white text-emerald-600 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}>
                      <TrendingUp size={12}/> 綜合情緒
                    </button>
                    <button onClick={() => setChartMode('emotions')} className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-all ${chartMode === 'emotions' ? 'bg-white text-purple-700 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}>
                      <Activity size={12}/> 六大情緒
                    </button>
                  </div>
                )}
              </div>
          </div>
        </div>

        <div className="flex-1 w-full min-h-0">
          {viewMode === 'chart' ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart key={`${chartMode}-${timeUnitOverview}`} data={chartDataOverview} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  tick={{fontSize: 11, fill: '#64748b'}} 
                  interval="preserveStartEnd" 
                  tickMargin={10} 
                  minTickGap={30} 
                />
                
                {chartMode === 'overview' && (
                  <>
                    <YAxis yAxisId="left" orientation="left" stroke="#3b82f6" tick={{fontSize: 12}} label={{ value: '篇數', angle: -90, position: 'insideLeft', fill: '#3b82f6', fontSize: 10 }}/>
                    <Area yAxisId="left" type="monotone" dataKey="count" name="報導篇數" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCount)" />
                  </>
                )}
                
                {chartMode === 'general_emotion' && (
                  <>
                    <YAxis yAxisId="sentiment" orientation="left" stroke="#10b981" domain={[-1, 1]} tick={{fontSize: 12}} label={{ value: '綜合情緒極性 (-1~1)', angle: -90, position: 'insideLeft', fill: '#10b981', fontSize: 10 }}/>
                    <ReferenceLine y={0} yAxisId="sentiment" stroke="#94a3b8" strokeDasharray="3 3" />
                    <Line yAxisId="sentiment" type="monotone" dataKey="avgSentiment" name="綜合情緒" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
                  </>
                )}

                {chartMode === 'emotions' && (
                  <>
                    <YAxis yAxisId="emotion" orientation="left" stroke="#64748b" domain={[0, 1]} tick={{fontSize: 12}} label={{ value: '情緒強度 (0-1)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}/>
                    <Line yAxisId="emotion" type="monotone" dataKey="joy" name="快樂" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    <Line yAxisId="emotion" type="monotone" dataKey="trust" name="信任" stroke="#10b981" strokeWidth={2} dot={false} />
                    <Line yAxisId="emotion" type="monotone" dataKey="anticipation" name="期待" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line yAxisId="emotion" type="monotone" dataKey="sadness" name="悲傷" stroke="#64748b" strokeWidth={2} dot={false} strokeDasharray="5 5"/>
                    <Line yAxisId="emotion" type="monotone" dataKey="anger" name="憤怒" stroke="#ef4444" strokeWidth={2} dot={false} />
                    <Line yAxisId="emotion" type="monotone" dataKey="fear" name="恐懼" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  </>
                )}
                <RechartsTooltip labelFormatter={(l, p) => p && p.length > 0 ? p[0].payload.fullLabel : l} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Legend verticalAlign="top" height={36}/>
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full overflow-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm text-left text-slate-600">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3">時間段</th>
                    <th className="px-4 py-3 text-right">篇數</th>
                    <th className="px-4 py-3 text-right">綜合情緒</th>
                    <th className="px-4 py-3 text-right">快樂</th>
                    <th className="px-4 py-3 text-right">悲傷</th>
                    <th className="px-4 py-3 text-right">憤怒</th>
                  </tr>
                </thead>
                <tbody>
                  {chartDataOverview.map((row, index) => (
                    <tr key={index} className="bg-white border-b hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.fullLabel}</td>
                      <td className="px-4 py-3 text-right">{row.count}</td>
                      <td className="px-4 py-3 text-right font-bold" style={{ color: row.avgSentiment >= 0 ? '#10b981' : '#ef4444' }}>
                        {row.avgSentiment > 0 ? `+${row.avgSentiment}` : row.avgSentiment}
                      </td>
                      <td className="px-4 py-3 text-right">{row.joy}</td>
                      <td className="px-4 py-3 text-right">{row.sadness}</td>
                      <td className="px-4 py-3 text-right">{row.anger}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* ==========================================================
          區塊 3：並排佈局 (左: 服務類別趨勢 | 右: 關鍵字探索+走勢)
          ========================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 左半部：服務類別趨勢 (自動拉長高度對齊右側，100%滿版堆疊面積圖) */}
        <Card className="flex flex-col h-full min-h-[500px]">
          <div className="mb-4 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <BarChart2 size={20} className="text-blue-600" />
                服務類別趨勢佔比
              </h2>
              <p className="text-xs text-slate-400 mt-1">追蹤各社福議題在媒體版面上的百分比變化</p>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">分析單位:</span>
                <TimeUnitSelector value={timeUnitService} onChange={setTimeUnitService} />
            </div>
          </div>

          <div className="flex-1 w-full min-h-0 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              {/* stackOffset="expand" 用於轉換為 100% 堆疊面積圖 */}
              <AreaChart key={timeUnitService} data={serviceTrendData} margin={{ top: 10, right: 20, left: -10, bottom: 10 }} stackOffset="expand">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{fontSize: 11, fill: '#64748b'}} interval="preserveStartEnd" tickMargin={10} minTickGap={20}/>
                
                {/* Y 軸轉換為百分比顯示 */}
                <YAxis tickFormatter={(tick) => `${(tick * 100).toFixed(0)}%`} tick={{fontSize: 11}} width={45} />
                
                {/* 自訂 Tooltip：同時顯示真實數量與百分比佔比 */}
                <RechartsTooltip 
                  labelFormatter={(label, payload) => payload && payload.length > 0 ? payload[0].payload.fullLabel : label}
                  formatter={(value, name, props) => {
                     const payloadData = props.payload;
                     let total = 0;
                     Object.keys(SERVICE_COLORS).forEach(k => {
                         total += (payloadData[k] || 0);
                     });
                     const percent = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
                     return [`${value} 篇 (${percent})`, name];
                  }}
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Legend wrapperStyle={{fontSize: '11px', paddingTop: '10px'}}/>
                {Object.keys(SERVICE_COLORS).map((type, index) => (
                  <Area 
                    key={type}
                    type="monotone" 
                    dataKey={type} 
                    stackId="1" 
                    stroke={SERVICE_COLORS[type]} 
                    fill={SERVICE_COLORS[type]} 
                    fillOpacity={0.8}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 右半部：關鍵字生態系 (上下疊加) */}
        <div className="flex flex-col gap-6">
            
            {/* 右上：文字雲 */}
            <Card className="flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                      <Cloud size={20} className="text-blue-600" />
                      關鍵字探索
                  </h2>
                  <p className="text-xs text-slate-400 hidden sm:block">點擊下方詞彙查看走勢</p>
                </div>
                <button 
                    onClick={() => setSelectedKeywords(keywordData.defaultTop5)}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:bg-blue-50 transition-colors shadow-sm"
                    title="重置為前5名"
                >
                    <RefreshCcw size={12}/> 重置選取
                </button>
              </div>

              <div className="bg-slate-50 rounded-lg border border-slate-100 relative p-4 max-h-[200px] overflow-y-auto">
                    <div className="absolute top-2 right-2 flex items-center gap-1 text-xs text-slate-500 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full shadow-sm z-20 pointer-events-none">
                      <MousePointerClick size={12}/> 點擊過濾
                    </div>
                    <SimpleWordCloud 
                      words={keywordData.cloudData} 
                      selectedWords={selectedKeywords}
                      onWordClick={handleKeywordClick}
                    />
              </div>
            </Card>

            {/* 右下：關鍵字走勢 */}
            <Card className="flex flex-col flex-1 min-h-[350px]">
              <div className="flex flex-col mb-4 gap-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <LineChartIcon size={20} className="text-blue-600" />
                        關鍵字走勢
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">追蹤所選關鍵字的報導頻次</p>
                  </div>
                  <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">分析單位:</span>
                      <TimeUnitSelector value={timeUnitKeyword} onChange={setTimeUnitKeyword} />
                  </div>
                </div>
              </div>

              <div className="flex-1 w-full min-h-0 mt-2">
                  {selectedKeywords.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart key={timeUnitKeyword} data={keywordData.trendData} margin={{ top: 10, right: 20, left: -20, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{fontSize: 11, fill: '#64748b'}} interval="preserveStartEnd" minTickGap={20} tickMargin={10}/>
                        <YAxis tick={{fontSize: 11}} width={40}/>
                        <RechartsTooltip labelFormatter={(l, p) => p && p.length > 0 ? p[0].payload.fullLabel : l} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}/>
                        <Legend wrapperStyle={{fontSize: '11px', paddingTop: '10px'}}/>
                        {selectedKeywords.map((kw, i) => (
                          <Line 
                            key={kw} 
                            type="monotone" 
                            dataKey={kw} 
                            stroke={KEYWORD_COLORS[i % KEYWORD_COLORS.length]} 
                            strokeWidth={2}
                            dot={false}
                            animationDuration={500}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                      <TrendingUp size={32} className="mb-2 opacity-50"/>
                      <p className="text-sm">請在上方點擊任意關鍵字</p>
                      <p className="text-xs mt-1">系統將在此顯示其聲量走勢</p>
                    </div>
                  )}
              </div>
            </Card>

        </div>
      </div>
    </div>
  );
}
