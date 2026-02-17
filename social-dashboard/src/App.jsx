import React, { useState, useEffect, useMemo } from 'react';
import { 
  ComposedChart, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, Area, AreaChart
} from 'recharts';
import { LayoutDashboard, FileText, Activity, Cloud, Filter, Search, TrendingUp, TrendingDown, Calendar, BarChart2, Clock, Layers, Table as TableIcon, LineChart as LineChartIcon, MousePointerClick, RefreshCcw, ChevronDown, CalendarDays, AlertCircle, CheckCircle2, Info, RefreshCw, Database } from 'lucide-react';

// --- 1. 模擬數據生成邏輯 (作為備用方案/Fallback) ---

const SERVICE_TYPES = ['安老服務', '青少年服務', '復康服務', '家庭及兒童', '社區發展', '社會保障'];
const SERVICE_COLORS = {
  '安老服務': '#8884d8',
  '青少年服務': '#82ca9d',
  '復康服務': '#ffc658',
  '家庭及兒童': '#ff8042',
  '社區發展': '#0088fe',
  '社會保障': '#00c49f',
  '其他社福': '#cbd5e1'
};

const KEYWORDS_BASE = {
  '安老服務': ['長者', '安老院', '樂齡科技', '獨居', '照顧者', '認知障礙', '醫療券'],
  '青少年服務': ['學生', '情緒健康', '生涯規劃', '外展', '童軍', '網癮', '青年宿舍'],
  '復康服務': ['殘疾人士', '共融', '庇護工場', '無障礙', '精神健康', '康復'],
  '家庭及兒童': ['虐兒', '寄養', '單親', '家庭關係', '社工', '保護兒童'],
  '社區發展': ['過渡性房屋', '關愛隊', '社區客廳', '扶貧', '基層', '劏房'],
  '社會保障': ['綜援', '高齡津貼', '施政報告', '財政預算案', '福利金']
};

const generateMockData = (days = 365) => {
  const data = [];
  const endDate = new Date();
  
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(endDate.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const newsCount = Math.floor(Math.random() * 8) + 2; 
    
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
  <div className={`bg-white p-6 rounded-xl shadow-sm border border-slate-100 ${className}`}>
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

const SimpleWordCloud = ({ words, selectedWords, onWordClick }) => {
  if (!words || words.length === 0) return <div className="text-center text-slate-400 py-10">無足夠數據</div>;
  const maxVal = Math.max(...words.map(w => w.value));
  
  return (
    <div className="flex flex-wrap gap-2 justify-center items-center h-full content-center p-2">
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
              transition-all cursor-pointer select-none px-3 py-1 rounded-full border
              ${isSelected 
                ? `bg-blue-50 ${baseColor} border-blue-300 shadow-md scale-105 font-bold z-10` 
                : `bg-transparent border-transparent ${baseColor} hover:bg-slate-50 hover:border-slate-200 font-medium`
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
  const [dataSource, setDataSource] = useState('connecting'); // 'connecting', 'real', 'mock', 'empty'
  const [connectionError, setConnectionError] = useState(''); 
  
  // 篩選設定
  const [dateRange, setDateRange] = useState('year'); 
  const [timeUnit, setTimeUnit] = useState('month'); 
  const [chartMode, setChartMode] = useState('overview'); 
  const [viewMode, setViewMode] = useState('chart'); 
  
  // 文字雲設定
  const [keywordDateRange, setKeywordDateRange] = useState('year'); 
  const [selectedKeywords, setSelectedKeywords] = useState([]);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // 核心：數據獲取 (使用代理路徑)
  const fetchData = async () => {
    setLoading(true);
    setDataSource('connecting');
    setConnectionError('');
    
    try {
     console.log("正在連線至 Render 雲端後端..."); 
      const controller = new AbortController();
      // 設定超時為 60 秒
      const timeoutId = setTimeout(() => controller.abort(), 60000); 

      // [修改點] 換成您的 Render 完整網址
      const response = await fetch('https://socialwelfaremedia.onrender.com/api/news-data', {
          signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
          throw new Error(`HTTP 錯誤! 狀態碼: ${response.status}`);
      }
      
      const realData = await response.json();
      console.log("成功獲取數據，筆數:", realData.length);
      
      if (Array.isArray(realData) && realData.length > 0) {
          setRawData(realData);
          setDataSource('real');
      } else {
          setConnectionError("連線成功，但目前資料庫為空");
          setRawData(generateMockData(365)); 
          setDataSource('empty'); 
      }

    } catch (error) {
      console.error("連線失敗:", error);
      let msg = "未知錯誤";
      if (error.name === 'AbortError') msg = "連線逾時 (後端回應太慢)";
      else msg = error.message;
      
      setConnectionError(msg);
      setRawData(generateMockData(365));
      setDataSource('mock');
    } finally {
      setLoading(false);
      // 初始化自訂日期
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      setCustomStartDate(start.toISOString().split('T')[0]);
      setCustomEndDate(end.toISOString().split('T')[0]);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- 數據處理邏輯 ---

  const filteredData = useMemo(() => {
    if (!rawData.length) return [];
    const now = new Date();
    const cutoff = new Date();
    if (dateRange === 'week') cutoff.setDate(now.getDate() - 7);
    else if (dateRange === 'month') cutoff.setDate(now.getDate() - 30);
    else cutoff.setDate(now.getDate() - 365);
    
    return rawData.filter(d => new Date(d.date) >= cutoff);
  }, [rawData, dateRange]);

  const keywordFilteredData = useMemo(() => {
    if (!rawData.length) return [];
    
    if (keywordDateRange === 'custom') {
        if (!customStartDate || !customEndDate) return rawData;
        const start = new Date(customStartDate);
        const end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999); 
        return rawData.filter(d => {
            const itemDate = new Date(d.date);
            return itemDate >= start && itemDate <= end;
        });
    }

    const now = new Date();
    const cutoff = new Date();
    if (keywordDateRange === 'half_year') cutoff.setDate(now.getDate() - 180);
    else cutoff.setDate(now.getDate() - 365); 
    
    return rawData.filter(d => new Date(d.date) >= cutoff);
  }, [rawData, keywordDateRange, customStartDate, customEndDate]);

  const keywordTimeUnit = 'month';

  const groupByTime = (data, unit) => {
    const getWeekStr = (dateObj) => {
        const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
        return `${d.getUTCFullYear()}-W${weekNo}`;
    };

    const getWeekRange = (year, week) => {
        const d = new Date(year, 0, 1 + (week - 1) * 7);
        const start = d;
        const end = new Date(d);
        end.setDate(d.getDate() + 6);
        return `${start.getMonth()+1}/${start.getDate()} - ${end.getMonth()+1}/${end.getDate()}`;
    };

    const grouped = {};

    data.forEach(item => {
      const dateObj = new Date(item.date);
      let key, displayLabel, rangeTooltip;

      if (unit === 'month') {
        key = item.date.substring(0, 7); 
        displayLabel = `${dateObj.getMonth() + 1}月`;
        rangeTooltip = key;
      } else if (unit === 'week') {
        key = getWeekStr(dateObj); 
        const [y, w] = key.split('-W');
        displayLabel = `W${w}`;
        rangeTooltip = `${key} (${getWeekRange(y, w)})`;
      } else {
        key = item.date; 
        displayLabel = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
        rangeTooltip = key;
      }

      if (!grouped[key]) {
        grouped[key] = { key, displayLabel, rangeTooltip, items: [], rawDate: dateObj };
      }
      grouped[key].items.push(item);
    });
    
    return Object.values(grouped).sort((a, b) => a.rawDate - b.rawDate);
  };

  const chartData = useMemo(() => {
    const grouped = groupByTime(filteredData, timeUnit);
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
  }, [filteredData, timeUnit]);

  const serviceTrendData = useMemo(() => {
    const grouped = groupByTime(filteredData, timeUnit);
    return grouped.map(group => {
      const counts = { name: group.displayLabel, fullLabel: group.rangeTooltip };
      Object.keys(SERVICE_COLORS).forEach(t => counts[t] = 0);
      
      group.items.forEach(item => {
        const type = SERVICE_COLORS[item.type] ? item.type : '其他社福';
        counts[type]++;
      });
      return counts;
    });
  }, [filteredData, timeUnit]);

  const keywordData = useMemo(() => {
    const totalStats = {};
    keywordFilteredData.forEach(item => {
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
    
    const grouped = groupByTime(keywordFilteredData, keywordTimeUnit);
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
  }, [keywordFilteredData, keywordTimeUnit]);

  useEffect(() => {
    if (keywordData.defaultTop5.length > 0) {
        setSelectedKeywords(keywordData.defaultTop5);
    } else {
        setSelectedKeywords([]);
    }
  }, [keywordDateRange, customStartDate, customEndDate, keywordData.defaultTop5]);

  const handleKeywordClick = (word) => {
    setSelectedKeywords(prev => {
      if (prev.includes(word)) return prev.filter(w => w !== word);
      else if (prev.length >= 8) return prev; 
      else return [...prev, word];
    });
  };

  const handleResetKeywords = () => {
    setSelectedKeywords(keywordData.defaultTop5);
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
      <header className="mb-8 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
            <LayoutDashboard className="text-blue-600" />
            社福新聞輿情分析系統
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <p className="text-slate-500">全方位動態追蹤 • 趨勢視覺化</p>
            
            {/* 連線狀態指示器 */}
            <div className={`group relative text-xs px-2 py-0.5 rounded-full flex items-center gap-1 cursor-help ${dataSource === 'real' ? 'bg-green-100 text-green-700' : dataSource === 'empty' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                {dataSource === 'real' ? <CheckCircle2 size={12}/> : dataSource === 'empty' ? <Database size={12}/> : <AlertCircle size={12}/>}
                <span>
                  {dataSource === 'real' ? `已連線 (資料筆數: ${rawData.length})` 
                   : dataSource === 'empty' ? '已連線 (但資料庫為空)' 
                   : '演示模式 (模擬數據)'}
                </span>
                
                {/* 錯誤詳情 Tooltip */}
                {dataSource !== 'real' && (
                  <div className="absolute left-0 top-full mt-1 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                    <p className="font-bold mb-1">系統訊息：</p>
                    <p>{connectionError}</p>
                  </div>
                )}
            </div>
            
            {/* 重試連線按鈕 */}
            <button 
              onClick={fetchData} 
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
              title="重新嘗試連線後端"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              {loading ? "連線中..." : "重試連線"}
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">儀表板時段:</span>
            <div className="flex bg-white rounded-lg p-1 shadow-sm border border-slate-200">
                <button onClick={() => setDateRange('week')} className={`px-4 py-2 text-sm rounded-md transition-all ${dateRange === 'week' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}>過去 7 天</button>
                <button onClick={() => setDateRange('month')} className={`px-4 py-2 text-sm rounded-md transition-all ${dateRange === 'month' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}>過去 30 天</button>
                <button onClick={() => setDateRange('year')} className={`px-4 py-2 text-sm rounded-md transition-all ${dateRange === 'year' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}>過去一年</button>
            </div>
        </div>
      </header>

      {/* 關鍵指標 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard title="分析文章總數" value={filteredData.length} subtext="基於當前篩選範圍" icon={FileText} colorClass="bg-blue-500 text-blue-500" />
        <StatCard title="綜合情緒指數" value={parseFloat(overallSentiment) > 0 ? `+${overallSentiment}` : overallSentiment} subtext="一維極性 (-1 ~ +1)" icon={parseFloat(overallSentiment) >= 0 ? TrendingUp : TrendingDown} colorClass={parseFloat(overallSentiment) >= 0 ? "bg-emerald-500 text-emerald-500" : "bg-rose-500 text-rose-500"} />
        <StatCard title="最關注議題" value={typeStats[0]?.name || "N/A"} subtext="報導量最高類別" icon={Activity} colorClass="bg-purple-500 text-purple-500" />
        <StatCard title="核心關鍵字" value={keywordData.cloudData[0]?.text || "N/A"} subtext="出現頻次最高" icon={Search} colorClass="bg-amber-500 text-amber-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 左側：趨勢分析區 */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card className="min-h-[450px]">
            <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Activity size={20} className="text-blue-600" />
                  輿情線性分析
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {viewMode === 'table' ? '查看原始數據' : (chartMode === 'overview' ? '顯示: 總體報導聲量' : '顯示: 六大情緒維度變化')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                   <div className="flex bg-slate-100 p-1 rounded-lg mr-2">
                    <button onClick={() => setViewMode('chart')} className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-all ${viewMode === 'chart' ? 'bg-white text-slate-800 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}>
                      <LineChartIcon size={12}/> 圖表
                    </button>
                    <button onClick={() => setViewMode('table')} className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-all ${viewMode === 'table' ? 'bg-white text-slate-800 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}>
                      <TableIcon size={12}/> 列表
                    </button>
                  </div>

                  {viewMode === 'chart' && (
                    <div className="flex bg-slate-100 p-1 rounded-lg mr-2">
                      <button onClick={() => setChartMode('overview')} className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-all ${chartMode === 'overview' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}>
                        <Layers size={12}/> 聲量
                      </button>
                      <button onClick={() => setChartMode('emotions')} className={`px-3 py-1.5 text-xs rounded-md flex items-center gap-1 transition-all ${chartMode === 'emotions' ? 'bg-white text-purple-700 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}>
                        <Activity size={12}/> 情緒
                      </button>
                    </div>
                  )}

                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setTimeUnit('day')} className={`px-2 py-1 text-xs rounded-md transition-all ${timeUnit === 'day' ? 'bg-white text-slate-800 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}>日</button>
                    <button onClick={() => setTimeUnit('week')} className={`px-2 py-1 text-xs rounded-md transition-all ${timeUnit === 'week' ? 'bg-white text-slate-800 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}>週</button>
                    <button onClick={() => setTimeUnit('month')} className={`px-2 py-1 text-xs rounded-md transition-all ${timeUnit === 'month' ? 'bg-white text-slate-800 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'}`}>月</button>
                  </div>
              </div>
            </div>

            <div className="h-[350px] w-full">
              {viewMode === 'chart' ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart key={`${chartMode}-${timeUnit}`} data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{fontSize: 11, fill: '#64748b'}} interval="preserveStartEnd" tickMargin={10} />
                    
                    {chartMode === 'overview' ? (
                      <>
                        <YAxis yAxisId="left" orientation="left" stroke="#3b82f6" tick={{fontSize: 12}} label={{ value: '篇數', angle: -90, position: 'insideLeft', fill: '#3b82f6', fontSize: 10 }}/>
                        <Area yAxisId="left" type="monotone" dataKey="count" name="報導篇數" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCount)" />
                      </>
                    ) : (
                      <>
                        <YAxis yAxisId="emotion" orientation="left" stroke="#64748b" domain={[0, 1]} tick={{fontSize: 12}} label={{ value: '強度 (0-1)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}/>
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
                        <th className="px-4 py-3 text-right">快樂</th>
                        <th className="px-4 py-3 text-right">悲傷</th>
                        <th className="px-4 py-3 text-right">憤怒</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((row, index) => (
                        <tr key={index} className="bg-white border-b hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                          <td className="px-4 py-3 text-right">{row.count}</td>
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

           <Card>
            <div className="mb-6 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <BarChart2 size={20} className="text-blue-600" />
                  服務類別趨勢追蹤
                </h2>
                <p className="text-xs text-slate-400 mt-1">追蹤不同服務議題的報導量變化 (堆疊圖)</p>
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={serviceTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{fontSize: 11, fill: '#64748b'}} interval="preserveStartEnd" tickMargin={10}/>
                  <YAxis tick={{fontSize: 12}} />
                  <RechartsTooltip 
                    labelFormatter={(label, payload) => payload && payload.length > 0 ? payload[0].payload.fullLabel : label}
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                  />
                  <Legend />
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
        </div>

        {/* 右側：側邊欄 */}
        <div className="flex flex-col gap-6">
          <Card className="flex-1 h-auto">
            <div className="flex flex-col mb-4 gap-3">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Cloud size={20} className="text-blue-600" />
                    關鍵字探索
                </h2>
                <button 
                    onClick={handleResetKeywords}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 px-2 py-1 rounded bg-slate-50 hover:bg-blue-50 transition-colors"
                    title="重置為前5名"
                >
                    <RefreshCcw size={12}/> 重置
                </button>
              </div>

              <div className="flex flex-col gap-2 bg-slate-50 p-2 rounded-lg">
                <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                        <Clock size={12} /> 分析時段:
                    </span>
                    <div className="flex bg-white rounded-md shadow-sm border border-slate-200">
                        {/* 簡化後的時段按鈕 */}
                        <button 
                            onClick={() => setKeywordDateRange('half_year')}
                            className={`px-3 py-1 text-xs transition-all first:rounded-l-md ${keywordDateRange === 'half_year' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            半年
                        </button>
                        <button 
                            onClick={() => setKeywordDateRange('year')}
                            className={`px-3 py-1 text-xs transition-all border-l border-r border-slate-100 ${keywordDateRange === 'year' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            1年
                        </button>
                        <button 
                            onClick={() => setKeywordDateRange('custom')}
                            className={`px-3 py-1 text-xs transition-all last:rounded-r-md flex items-center gap-1 ${keywordDateRange === 'custom' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <CalendarDays size={10} /> 自訂
                        </button>
                    </div>
                </div>

                {keywordDateRange === 'custom' && (
                    <div className="flex items-center gap-2 mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                        <input 
                            type="date" 
                            value={customStartDate} 
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 text-slate-600"
                        />
                        <span className="text-slate-400 text-xs">至</span>
                        <input 
                            type="date" 
                            value={customEndDate} 
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 text-slate-600"
                        />
                    </div>
                )}
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 min-h-[250px] relative mb-4">
                 <div className="absolute top-2 right-2 flex items-center gap-1 text-xs text-slate-400 bg-white px-2 py-1 rounded-full shadow-sm z-20">
                    <MousePointerClick size={12}/> 點擊選取
                 </div>
                 <SimpleWordCloud 
                    words={keywordData.cloudData} 
                    selectedWords={selectedKeywords}
                    onWordClick={handleKeywordClick}
                 />
            </div>

            <div className="flex justify-center items-center mb-4 text-slate-300">
               <div className="h-px bg-slate-100 flex-1"></div>
               <span className="px-2 text-xs font-medium flex items-center gap-1">
                 <ChevronDown size={14}/> 
                 關鍵字聲量趨勢 (每月)
               </span>
               <div className="h-px bg-slate-100 flex-1"></div>
            </div>

            <div className="h-[250px] w-full pb-2">
                {selectedKeywords.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={keywordData.trendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{fontSize: 10}} interval="preserveStartEnd" />
                      <YAxis tick={{fontSize: 10}} width={30}/>
                      <RechartsTooltip labelFormatter={(l, p) => p && p.length > 0 ? p[0].payload.fullLabel : l} />
                      <Legend wrapperStyle={{fontSize: '10px'}}/>
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

          <Card>
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <PieChart size={20} className="text-blue-600" />
              類別總體分佈
            </h2>
            <div className="h-[200px] w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeStats} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value"
                  >
                    {typeStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={SERVICE_COLORS[entry.name]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                <div className="text-xl font-bold text-slate-700">{filteredData.length}</div>
                <div className="text-[10px] text-slate-400">總篇數</div>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
