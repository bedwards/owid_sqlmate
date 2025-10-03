import React, { useState, useEffect, useRef } from 'react';
import { Download, Play, Database, FileCode, Image, FileText } from 'lucide-react';
import Plotly from 'plotly.js-dist';

// SQL Keywords for autocomplete
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'JOIN', 'LEFT JOIN',
  'INNER JOIN', 'ON', 'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'AS',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'DISTINCT', 'HAVING', 'ASC', 'DESC'
];

// Sample OWID datasets
const DATASETS = [
  { name: 'co2_data', url: 'https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv', description: 'CO2 and Greenhouse Gas Emissions' },
  { name: 'covid_data', url: 'https://raw.githubusercontent.com/owid/covid-19-data/master/public/data/owid-covid-data.csv', description: 'COVID-19 Dataset' },
  { name: 'energy_data', url: 'https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv', description: 'Energy Data' }
];

export default function OWIDAnalytics() {
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [sqlQuery, setSqlQuery] = useState('');
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [queryResult, setQueryResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const chartRef = useRef(null);
  const textareaRef = useRef(null);

  // Load dataset
  const loadDataset = async (dataset) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(dataset.url);
      const csvText = await response.text();
      const parsed = parseCSV(csvText);
      setData(parsed.data);
      setColumns(parsed.columns);
      setSelectedDataset(dataset);
      setSqlQuery(`SELECT * FROM ${dataset.name} LIMIT 100`);
    } catch (err) {
      setError('Failed to load dataset: ' + err.message);
    }
    setLoading(false);
  };

  // Simple CSV parser
  const parseCSV = (text) => {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = [];
    
    for (let i = 1; i < Math.min(lines.length, 10000); i++) {
      const values = lines[i].split(',');
      const row = {};
      headers.forEach((header, idx) => {
        const value = values[idx]?.trim().replace(/"/g, '');
        row[header] = isNaN(value) || value === '' ? value : Number(value);
      });
      data.push(row);
    }
    
    return { columns: headers, data };
  };

  // Execute SQL query (simplified client-side)
  const executeQuery = () => {
    if (!data.length) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = parseAndExecuteSQL(sqlQuery, data, columns);
      setQueryResult(result);
      setTimeout(() => generateChart(result), 100);
    } catch (err) {
      setError('Query error: ' + err.message);
    }
    
    setLoading(false);
  };

  // Simplified SQL parser and executor
  const parseAndExecuteSQL = (query, data, columns) => {
    const upperQuery = query.toUpperCase();
    
    // Parse SELECT columns
    const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
    if (!selectMatch) throw new Error('Invalid SELECT statement');
    
    const selectPart = selectMatch[1].trim();
    const isSelectAll = selectPart === '*';
    
    // Parse LIMIT
    const limitMatch = query.match(/LIMIT\s+(\d+)/i);
    const limit = limitMatch ? parseInt(limitMatch[1]) : data.length;
    
    // Parse WHERE
    const whereMatch = query.match(/WHERE\s+(.+?)(?:\s+GROUP|\s+ORDER|\s+LIMIT|$)/i);
    let filteredData = [...data];
    
    if (whereMatch) {
      const whereClause = whereMatch[1].trim();
      filteredData = filteredData.filter(row => evaluateWhere(row, whereClause));
    }
    
    // Parse GROUP BY
    const groupByMatch = query.match(/GROUP\s+BY\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i);
    
    if (groupByMatch) {
      const groupByCol = groupByMatch[1].trim();
      const aggregated = aggregateData(filteredData, groupByCol, selectPart);
      filteredData = aggregated;
    }
    
    // Parse ORDER BY
    const orderByMatch = query.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/i);
    if (orderByMatch) {
      const orderParts = orderByMatch[1].trim().split(/\s+/);
      const orderCol = orderParts[0];
      const orderDir = orderParts[1]?.toUpperCase() === 'DESC' ? -1 : 1;
      filteredData.sort((a, b) => {
        if (a[orderCol] < b[orderCol]) return -1 * orderDir;
        if (a[orderCol] > b[orderCol]) return 1 * orderDir;
        return 0;
      });
    }
    
    // Apply LIMIT
    filteredData = filteredData.slice(0, limit);
    
    // Select columns
    if (!isSelectAll && !groupByMatch) {
      const selectedCols = selectPart.split(',').map(c => c.trim());
      filteredData = filteredData.map(row => {
        const newRow = {};
        selectedCols.forEach(col => {
          newRow[col] = row[col];
        });
        return newRow;
      });
    }
    
    const resultColumns = Object.keys(filteredData[0] || {});
    return { data: filteredData, columns: resultColumns };
  };

  const evaluateWhere = (row, whereClause) => {
    // Simple WHERE evaluation
    const match = whereClause.match(/(\w+)\s*=\s*['"]?([^'"]+)['"]?/);
    if (match) {
      const [, col, val] = match;
      return String(row[col]) === val;
    }
    return true;
  };

  const aggregateData = (data, groupCol, selectPart) => {
    const groups = {};
    
    data.forEach(row => {
      const key = row[groupCol];
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });
    
    const result = [];
    const aggMatch = selectPart.match(/(COUNT|SUM|AVG|MIN|MAX)\(([^)]+)\)/gi);
    
    for (const [key, rows] of Object.entries(groups)) {
      const newRow = { [groupCol]: key };
      
      if (aggMatch) {
        aggMatch.forEach(agg => {
          const match = agg.match(/(COUNT|SUM|AVG|MIN|MAX)\(([^)]+)\)/i);
          if (match) {
            const [, func, col] = match;
            const cleanCol = col.trim().replace(/\*/g, groupCol);
            
            switch (func.toUpperCase()) {
              case 'COUNT':
                newRow[agg] = rows.length;
                break;
              case 'SUM':
                newRow[agg] = rows.reduce((sum, r) => sum + (Number(r[cleanCol]) || 0), 0);
                break;
              case 'AVG':
                newRow[agg] = rows.reduce((sum, r) => sum + (Number(r[cleanCol]) || 0), 0) / rows.length;
                break;
              case 'MIN':
                newRow[agg] = Math.min(...rows.map(r => Number(r[cleanCol]) || 0));
                break;
              case 'MAX':
                newRow[agg] = Math.max(...rows.map(r => Number(r[cleanCol]) || 0));
                break;
            }
          }
        });
      }
      
      result.push(newRow);
    }
    
    return result;
  };

  // Smart chart generation
  const generateChart = (result) => {
    if (!result || !result.data.length || !chartRef.current) return;
    
    const { data, columns } = result;
    const chartConfig = analyzeDataForChart(data, columns, sqlQuery);
    
    Plotly.newPlot(chartRef.current, chartConfig.data, chartConfig.layout, {
      responsive: true,
      displayModeBar: true,
      modeBarButtonsToAdd: ['downloadSvg']
    });
  };

  const analyzeDataForChart = (data, columns, query) => {
    const numericCols = columns.filter(col => 
      typeof data[0][col] === 'number' && !col.toLowerCase().includes('year')
    );
    const categoricalCols = columns.filter(col => 
      typeof data[0][col] === 'string' || col.toLowerCase().includes('year')
    );
    const timeCols = columns.filter(col => 
      col.toLowerCase().includes('year') || col.toLowerCase().includes('date')
    );
    
    const hasGroupBy = query.toUpperCase().includes('GROUP BY');
    const hasAggregation = /COUNT|SUM|AVG|MIN|MAX/i.test(query);
    
    let chartType = 'scatter';
    let xCol = columns[0];
    let yCol = columns[1] || columns[0];
    let colorCol = null;
    
    // Smart chart type selection
    if (timeCols.length > 0 && numericCols.length > 0) {
      chartType = 'line';
      xCol = timeCols[0];
      yCol = numericCols[0];
    } else if (hasGroupBy && hasAggregation) {
      chartType = 'bar';
      xCol = categoricalCols[0] || columns[0];
      yCol = numericCols[0] || columns[1];
    } else if (categoricalCols.length > 0 && numericCols.length === 1) {
      chartType = 'pie';
    } else if (numericCols.length >= 2) {
      chartType = 'scatter';
      xCol = numericCols[0];
      yCol = numericCols[1];
      if (categoricalCols.length > 0) colorCol = categoricalCols[0];
    }
    
    // Generate chart data
    const chartData = generatePlotlyData(data, chartType, xCol, yCol, colorCol);
    
    // Generate smart title
    const title = generateChartTitle(query, xCol, yCol, chartType);
    
    const layout = {
      title: { text: title, font: { size: 18 } },
      xaxis: { title: xCol },
      yaxis: { title: yCol },
      hovermode: 'closest',
      showlegend: colorCol ? true : false,
      plot_bgcolor: '#f9fafb',
      paper_bgcolor: '#ffffff'
    };
    
    return { data: chartData, layout };
  };

  const generatePlotlyData = (data, chartType, xCol, yCol, colorCol) => {
    if (chartType === 'pie') {
      return [{
        type: 'pie',
        labels: data.map(row => row[xCol]),
        values: data.map(row => row[yCol]),
        textinfo: 'label+percent',
        hovertemplate: '<b>%{label}</b><br>%{value}<br>%{percent}<extra></extra>'
      }];
    }
    
    if (colorCol) {
      const groups = {};
      data.forEach(row => {
        const group = row[colorCol];
        if (!groups[group]) groups[group] = { x: [], y: [] };
        groups[group].x.push(row[xCol]);
        groups[group].y.push(row[yCol]);
      });
      
      return Object.entries(groups).map(([name, values]) => ({
        type: chartType,
        mode: chartType === 'scatter' ? 'markers' : 'lines',
        name: name,
        x: values.x,
        y: values.y,
        hovertemplate: `<b>${name}</b><br>${xCol}: %{x}<br>${yCol}: %{y}<extra></extra>`
      }));
    }
    
    return [{
      type: chartType,
      mode: chartType === 'scatter' ? 'markers' : 'lines',
      x: data.map(row => row[xCol]),
      y: data.map(row => row[yCol]),
      hovertemplate: `${xCol}: %{x}<br>${yCol}: %{y}<extra></extra>`
    }];
  };

  const generateChartTitle = (query, xCol, yCol, chartType) => {
    if (query.toUpperCase().includes('GROUP BY')) {
      return `${yCol} by ${xCol}`;
    }
    if (query.toLowerCase().includes('year')) {
      return `${yCol} Over Time`;
    }
    return `${yCol} vs ${xCol}`;
  };

  // Autocomplete
  const handleInputChange = (e) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart;
    setSqlQuery(value);
    setCursorPosition(cursor);
    
    const currentWord = getCurrentWord(value, cursor);
    if (currentWord.length > 0) {
      const suggestions = getSuggestions(currentWord);
      setSuggestions(suggestions);
      setShowSuggestions(suggestions.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const getCurrentWord = (text, cursor) => {
    const beforeCursor = text.slice(0, cursor);
    const match = beforeCursor.match(/(\w+)$/);
    return match ? match[1] : '';
  };

  const getSuggestions = (word) => {
    const upper = word.toUpperCase();
    const suggestions = [];
    
    SQL_KEYWORDS.forEach(kw => {
      if (kw.startsWith(upper)) suggestions.push(kw);
    });
    
    if (selectedDataset) {
      columns.forEach(col => {
        if (col.toLowerCase().startsWith(word.toLowerCase())) {
          suggestions.push(col);
        }
      });
    }
    
    return suggestions.slice(0, 10);
  };

  const applySuggestion = (suggestion) => {
    const beforeCursor = sqlQuery.slice(0, cursorPosition);
    const afterCursor = sqlQuery.slice(cursorPosition);
    const currentWord = getCurrentWord(beforeCursor, cursorPosition);
    const newBefore = beforeCursor.slice(0, -currentWord.length) + suggestion;
    setSqlQuery(newBefore + afterCursor);
    setShowSuggestions(false);
    textareaRef.current?.focus();
  };

  // Export functions
  const exportHTML = () => {
    if (!chartRef.current) return;
    Plotly.downloadImage(chartRef.current, {
      format: 'html',
      filename: 'owid_chart'
    });
  };

  const exportPNG = () => {
    if (!chartRef.current) return;
    Plotly.downloadImage(chartRef.current, {
      format: 'png',
      width: 1200,
      height: 800,
      filename: 'owid_chart'
    });
  };

  const exportSVG = () => {
    if (!chartRef.current) return;
    Plotly.downloadImage(chartRef.current, {
      format: 'svg',
      filename: 'owid_chart'
    });
  };

  const exportNotebook = () => {
    if (!queryResult) return;
    
    const code = `# Our World in Data Analysis
# Generated from SQL query

import pandas as pd
import plotly.express as px

# Load data
df = pd.read_csv('${selectedDataset.url}')

# SQL Query: ${sqlQuery}

# Sample equivalent pandas code:
# filtered_df = df[...your filtering logic...]

# Create chart
fig = px.${getPlotlyExpressType()}(df, 
    x='${queryResult.columns[0]}', 
    y='${queryResult.columns[1] || queryResult.columns[0]}',
    title='${generateChartTitle(sqlQuery, queryResult.columns[0], queryResult.columns[1] || queryResult.columns[0], 'line')}'
)
fig.show()
`;
    
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'owid_analysis.py';
    a.click();
  };

  const getPlotlyExpressType = () => {
    if (sqlQuery.toUpperCase().includes('GROUP BY')) return 'bar';
    if (sqlQuery.toLowerCase().includes('year')) return 'line';
    return 'scatter';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2 flex items-center gap-3">
            <Database className="text-blue-600" />
            Our World in Data - SQL Analytics
          </h1>
          <p className="text-gray-600">Query global datasets with SQL and generate intelligent visualizations</p>
        </div>

        {/* Dataset Selection */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Select Dataset</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DATASETS.map(dataset => (
              <button
                key={dataset.name}
                onClick={() => loadDataset(dataset)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  selectedDataset?.name === dataset.name
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="font-semibold text-gray-800">{dataset.name}</div>
                <div className="text-sm text-gray-600 mt-1">{dataset.description}</div>
              </button>
            ))}
          </div>
        </div>

        {selectedDataset && (
          <>
            {/* SQL Editor */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">SQL Query Editor</h2>
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={sqlQuery}
                  onChange={handleInputChange}
                  className="w-full h-32 p-4 font-mono text-sm border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  placeholder="Enter your SQL query..."
                />
                {showSuggestions && (
                  <div className="absolute z-10 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {suggestions.map((sug, idx) => (
                      <div
                        key={idx}
                        onClick={() => applySuggestion(sug)}
                        className="px-4 py-2 hover:bg-blue-50 cursor-pointer font-mono text-sm"
                      >
                        {sug}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={executeQuery}
                disabled={loading}
                className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2 font-semibold"
              >
                <Play size={20} />
                {loading ? 'Executing...' : 'Run Query'}
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-300 text-red-700 p-4 rounded-lg mb-6">
                {error}
              </div>
            )}

            {/* Results */}
            {queryResult && (
              <>
                {/* Chart */}
                <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">Visualization</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={exportPNG}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                      >
                        <Image size={16} />
                        PNG
                      </button>
                      <button
                        onClick={exportSVG}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
                      >
                        <FileText size={16} />
                        SVG
                      </button>
                      <button
                        onClick={exportNotebook}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2"
                      >
                        <FileCode size={16} />
                        Notebook
                      </button>
                    </div>
                  </div>
                  <div ref={chartRef} className="w-full" style={{ height: '500px' }} />
                </div>

                {/* Data Table */}
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h2 className="text-xl font-semibold mb-4">
                    Query Results ({queryResult.data.length} rows)
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          {queryResult.columns.map(col => (
                            <th key={col} className="px-4 py-2 text-left font-semibold">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {queryResult.data.slice(0, 100).map((row, idx) => (
                          <tr key={idx} className="border-t hover:bg-gray-50">
                            {queryResult.columns.map(col => (
                              <td key={col} className="px-4 py-2">
                                {typeof row[col] === 'number' 
                                  ? row[col].toLocaleString() 
                                  : row[col]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}