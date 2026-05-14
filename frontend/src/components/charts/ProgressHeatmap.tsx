import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

interface HeatmapData {
  blocks: string[];
  activities: string[];
  matrix: [number, number, number, number][]; // [blockIndex, activityIndex, progressValue, delayDays]
}

interface ProgressHeatmapProps {
  title: string;
  data: HeatmapData;
  height?: string | number;
  onCellClick?: (block: string, activity: string, value: number, delay: number) => void;
}

const ProgressHeatmap: React.FC<ProgressHeatmapProps> = ({ 
  title, 
  data, 
  height = 450,
  onCellClick 
}) => {
  const { blocks, activities, matrix } = data;

  // Detect dark mode
  const [isDark, setIsDark] = React.useState(false);
  React.useEffect(() => {
    const checkDark = () => setIsDark(document.documentElement.classList.contains('dark'));
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const textColor = isDark ? '#94a3b8' : '#64748b';
  const labelColor = isDark ? '#cbd5e1' : '#1e293b';
  const gridColor = isDark ? '#334155' : '#e2e8f0';

  const option = useMemo(() => {
    return {
      title: {
        text: title,
        left: 'left',
        textStyle: {
          fontSize: 14,
          fontWeight: 'bold',
          color: labelColor
        },
        padding: [0, 0, 20, 10]
      },
      tooltip: {
        position: 'top',
        backgroundColor: isDark ? '#1e293b' : 'rgba(255, 255, 255, 0.98)',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        borderWidth: 1,
        textStyle: { color: isDark ? '#f8fafc' : '#1e293b' },
        formatter: (params: any) => {
          if (params.seriesType === 'scatter') return null;
          
          const block = blocks[params.data[0]];
          const activity = activities[params.data[1]];
          const value = params.data[2];
          const item = matrix.find(m => m[0] === params.data[0] && m[1] === params.data[1]);
          const delay = item ? item[3] : 0;
          
          return `
            <div style="padding: 10px; min-width: 160px;">
              <div style="font-weight: 800; color: ${isDark ? '#f8fafc' : '#1e293b'}; border-bottom: 1px solid ${isDark ? '#334155' : '#f1f5f9'}; padding-bottom: 6px; margin-bottom: 8px; font-size: 13px;">${block}</div>
              <div style="font-size: 11px; color: ${isDark ? '#94a3b8' : '#64748b'}; margin-bottom: 8px; white-space: normal; line-height: 1.4;">${activity}</div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-size: 11px; color: #94a3b8;">Progress:</span>
                <span style="font-size: 13px; font-weight: 700; color: ${value >= 100 ? '#10b981' : value >= 50 ? '#f59e0b' : '#ef4444'}">${value}%</span>
              </div>
              ${delay > 0 ? `
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; padding-top: 4px; border-top: 1px dashed ${isDark ? '#ef4444' : '#fee2e2'}">
                <span style="font-size: 11px; color: #ef4444; font-weight: 600;">⚠️ DELAY:</span>
                <span style="font-size: 13px; font-weight: 700; color: #ef4444;">${delay} Days</span>
              </div>` : ''}
            </div>
          `;
        }
      },
      grid: {
        top: '12%',
        bottom: '15%',
        left: '5%',
        right: '5%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: blocks,
        splitArea: { show: true, areaStyle: { color: isDark ? ['#0f172a', '#1e293b'] : ['#ffffff', '#f8fafc'] } },
        axisLabel: { rotate: 35, fontSize: 10, color: textColor, fontWeight: 500 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: gridColor } }
      },
      yAxis: {
        type: 'category',
        data: activities,
        splitArea: { show: true, areaStyle: { color: isDark ? ['#0f172a', '#1e293b'] : ['#ffffff', '#f8fafc'] } },
        axisLabel: { fontSize: 10, color: textColor, fontWeight: 500 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: gridColor } }
      },
      visualMap: {
        min: 0,
        max: 100,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        inRange: {
          color: isDark ? 
            ['#450a0a', '#451a03', '#064e3b', '#10b981'] : // Darker base for dark mode
            ['#fee2e2', '#fef3c7', '#d1fae5', '#10b981']
        },
        textStyle: { fontSize: 10, color: textColor, fontWeight: 600 },
        formatter: '{value}%'
      },
      series: [
        {
          name: 'Progress',
          type: 'heatmap',
          data: matrix.map(item => [item[0], item[1], item[2]]),
          label: { show: false },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
              borderColor: isDark ? '#f8fafc' : '#334155',
              borderWidth: 2
            }
          },
          itemStyle: {
            borderWidth: 1,
            borderColor: isDark ? '#0f172a' : '#fff',
            borderRadius: 2
          }
        },
        {
          name: 'Delay Indicator',
          type: 'scatter',
          coordinateSystem: 'cartesian2d',
          symbol: 'circle',
          symbolSize: (val: any, params: any) => {
            const item = matrix.find(m => m[0] === params.data[0] && m[1] === params.data[1]);
            return item && item[3] > 0 ? 6 : 0;
          },
          data: matrix.filter(m => m[3] > 0).map(m => [m[0], m[1]]),
          itemStyle: {
            color: '#ef4444',
            opacity: 1,
            borderColor: isDark ? '#0f172a' : '#fff',
            borderWidth: 1
          },
          z: 10,
          tooltip: { show: false }
        }
      ]
    };
  }, [blocks, activities, matrix, title, isDark, textColor, labelColor, gridColor]);

  if (!blocks.length || !activities.length) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 bg-slate-50/50 dark:bg-slate-900/50 border-dashed border-2 border-slate-200 dark:border-slate-800 rounded-2xl">
        <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-full mb-4">
          <AlertCircle className="w-8 h-8 text-slate-400" />
        </div>
        <p className="text-slate-500 dark:text-slate-400 font-semibold tracking-tight">No block-wise data available</p>
      </Card>
    );
  }

  const handleEvents = {
    click: (params: any) => {
      if (onCellClick && (params.seriesType === 'heatmap' || params.seriesType === 'scatter')) {
        const item = matrix.find(m => m[0] === params.data[0] && m[1] === params.data[1]);
        if (item) {
          onCellClick(blocks[item[0]], activities[item[1]], item[2], item[3]);
        }
      }
    }
  };

  return (
    <div className="w-full h-full min-h-[400px] bg-white dark:bg-transparent rounded-xl p-2">
      <ReactECharts 
        option={option} 
        style={{ height: height, width: '100%' }} 
        onEvents={handleEvents}
        opts={{ renderer: 'svg' }}
      />
    </div>
  );
};

export default ProgressHeatmap;
