const { useState, useEffect, useRef } = React;
const { Play, Database, FileCode, Image, AlertCircle, CheckCircle, Loader } = lucide;

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'OFFSET',
  'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN', 'ON',
  'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'IS NULL', 'IS NOT NULL',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'DISTINCT', 'AS',
  'HAVING', 'ASC', 'DESC', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'
];

const DATASETS = [
  { 
    id: 'co2_data',
    name: 'CO2 & Greenhouse Gas Emissions',
    url: 'https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv',
    description: 'CO2 emissions, greenhouse gases, and climate data by country',
    tableName: 'co2_data'
  },
  { 
    id: 'energy_data',
    name: 'Energy Data',
    url: 'https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv',
    description: 'Energy production, consumption, and mix by country',
    tableName: 'energy_data'
  },
  { 
    id: 'covid_data',
    name: 'COVID-19 Data',
    url: 'https://raw.githubusercontent.com/owid/covid-19-data/master/public/data/owid-covid-data.csv',
    description: 'COVID-19 cases, deaths, testing, and vaccinations',
    tableName: 'covid_data'
  },
  { 
    id: 'literacy',
    name: 'Literacy Rates',
    url: 'https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Cross-country%20literacy%20rates%20-%20World%20Bank%2C%20CIA%20World%20Factbook%2C%20and%20other%20sources/Cross-country%20literacy%20rates%20-%20World%20Bank%2C%20CIA%20World%20Factbook%2C%20and%20other%20sources.csv',
    description: 'Historical literacy rates by country (1475-present)',
    tableName: 'literacy'
  }
];

function OWIDAnalytics() {
  const [db, setDb] = useState(null);
  const [duckdb, setDuckdb] = useState(null);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [sqlQuery, setSqlQuery] = useState('');
  const [columns, setColumns] = useState([]);
  const [queryResult, setQueryResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const chartRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    initDuckDB();
  }, []);

  const initDuckDB = async () => {
    try {
      setLoadingMessage('Initializing SQL engine...');
      
      // Initialize sql.js
      const SQL = await initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
      });
      
      const database = new SQL.Database();
      
      setDb(database);
      setSuccess('SQL engine ready!');
      setLoadingMessage('');
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to initialize SQL engine: ' + err.message);
      console.error('SQL.js init error:', err);
      setLoadingMessage('');
    }
  };

  const loadDataset = async (dataset) => {
    if (!db) {
      setError('SQL engine not initialized');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setLoadingMessage(`Loading ${dataset.name}...`);
    
    try {
      // Drop table if exists
      try {
        db.run(`DROP TABLE IF EXISTS ${dataset.tableName}`);
      } catch (e) {}

      // Fetch CSV data
      setLoadingMessage('Downloading data from Our World in Data...');
      const response = await fetch(dataset.url);
      const csvText = await response.text();
      
      // Parse CSV with PapaParse
      setLoadingMessage('Parsing CSV data...');
      const parseResult = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false, // Keep everything as strings for SQL
        transformHeader: (header) => header.trim()
      });
      
      if (parseResult.errors.length > 0) {
        console.warn('CSV parsing warnings:', parseResult.errors);
      }
      
      const headers = parseResult.meta.fields;
      const rows = parseResult.data;
      
      if (!headers || headers.length === 0) {
        throw new Error('No columns found in CSV');
      }
      
      // Create table with quoted column names to handle spaces/special chars
      const columnDefs = headers.map(h => `"${h}" TEXT`).join(', ');
      db.run(`CREATE TABLE ${dataset.tableName} (${columnDefs})`);
      
      // Prepare insert statement
      const placeholders = headers.map(() => '?').join(',');
      const insertStmt = db.prepare(`INSERT INTO ${dataset.tableName} VALUES (${placeholders})`);
      
      // Insert data in batches
      setLoadingMessage('Loading data into database...');
      const batchSize = 1000;
      
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, Math.min(i + batchSize, rows.length));
        
        batch.forEach(row => {
          const values = headers.map(h => row[h] === undefined || row[h] === null ? '' : String(row[h]));
          try {
            insertStmt.run(values);
          } catch (e) {
            console.error('Error inserting row:', e, row);
          }
        });
        
        if (i % 5000 === 0 && i > 0) {
          setLoadingMessage(`Loading data... ${i.toLocaleString()} / ${rows.length.toLocaleString()} rows`);
        }
      }
      
      insertStmt.free();
      
      // Get column info
      setLoadingMessage('Analyzing data structure...');
      const columnsResult = db.exec(`PRAGMA table_info(${dataset.tableName})`);
      const columnNames = columnsResult[0].values.map(row => row[1]);
      setColumns(columnNames);
      
      // Get row count
      const countResult = db.exec(`SELECT COUNT(*) as count FROM ${dataset.tableName}`);
      const rowCount = countResult[0].values[0][0];
      
      setSelectedDataset(dataset);
      setSqlQuery(`SELECT * FROM ${dataset.tableName} LIMIT 100`);
      setSuccess(`✓ Loaded ${parseInt(rowCount).toLocaleString()} rows with ${columnNames.length} columns`);
      setLoadingMessage('');
      
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError('Failed to load dataset: ' + err.message);
      console.error('Load error:', err);
      setLoadingMessage('');
    }
    
    setLoading(false);
  };

  const executeQuery = async () => {
    if (!db || !selectedDataset) return;
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    setLoadingMessage('Executing query...');
    
    try {
      const result = db.exec(sqlQuery);
      
      if (!result || result.length === 0) {
        setQueryResult({ data: [], columns: [] });
        setSuccess('✓ Query returned 0 rows');
        setLoadingMessage('');
        setLoading(false);
        return;
      }
      
      const columns = result[0].columns;
      const rows = result[0].values.map(row => {
        const obj = {};
        columns.forEach((col, idx) => {
          // Try to convert to number if possible
          const val = row[idx];
          obj[col] = isNaN(val) || val === '' ? val : Number(val);
        });
        return obj;
      });
      
      setQueryResult({ data: rows, columns: columns });
      setSuccess(`✓ Query returned ${rows.length} rows`);
      setLoadingMessage('');
      
      setTimeout(() => {
        setSuccess(null);
        generateChart({ data: rows, columns: columns });
      }, 1000);
      
    } catch (err) {
      setError('Query error: ' + err.message);
      setLoadingMessage('');
      setQueryResult(null);
    }
    
    setLoading(false);
  };

  const generateChart = (result) => {
    if (!result || !result.data.length || !chartRef.current) return;
    
    const { data, columns } = result;
    const chartConfig = analyzeDataForChart(data, columns);
    
    Plotly.newPlot(chartRef.current, chartConfig.data, chartConfig.layout, {
      responsive: true,
      displayModeBar: true,
      modeBarButtonsToAdd: ['downloadSvg']
    });
  };

  const analyzeDataForChart = (data, columns) => {
    if (!data.length || !columns.length) return { data: [], layout: {} };

    const numericCols = columns.filter(col => {
      const val = data[0][col];
      return typeof val === 'number' && !col.toLowerCase().includes('year') && 
             !col.toLowerCase().includes('id') && !col.toLowerCase().includes('code');
    });
    
    const categoricalCols = columns.filter(col => {
      const val = data[0][col];
      return typeof val === 'string' || col.toLowerCase().includes('year');
    });
    
    const timeCols = columns.filter(col => 
      col.toLowerCase().includes('year') || col.toLowerCase().includes('date') || col.toLowerCase().includes('time')
    );

    const queryUpper = sqlQuery.toUpperCase();
    const hasGroupBy = queryUpper.includes('GROUP BY');
    const hasAggregation = /COUNT|SUM|AVG|MIN|MAX/i.test(sqlQuery);
    const isTimeSeries = timeCols.length > 0 && numericCols.length > 0;
    
    let chartType = 'scatter';
    let xCol = columns[0];
    let yCol = columns.length > 1 ? columns[1] : columns[0];
    let colorCol = null;
    let mode = 'markers';

    if (isTimeSeries) {
      chartType = 'scatter';
      mode = 'lines+markers';
      xCol = timeCols[0];
      yCol = numericCols[0];
      if (categoricalCols.length > 1) colorCol = categoricalCols[0];
    } else if (hasGroupBy && hasAggregation) {
      chartType = 'bar';
      xCol = categoricalCols[0] || columns[0];
      yCol = numericCols[0] || columns[1];
    } else if (categoricalCols.length > 0 && numericCols.length === 1 && data.length < 20) {
      chartType = 'pie';
      xCol = categoricalCols[0];
      yCol = numericCols[0];
    } else if (numericCols.length >= 2) {
      chartType = 'scatter';
      xCol = numericCols[0];
      yCol = numericCols[1];
      if (categoricalCols.length > 0) colorCol = categoricalCols[0];
    }

    const chartData = generatePlotlyData(data, chartType, xCol, yCol, colorCol, mode);
    const title = generateChartTitle(xCol, yCol, chartType);
    
    const layout = {
      title: { text: title, font: { size: 20, color: '#1f2937' } },
      xaxis: { 
        title: { text: xCol, font: { size: 14 } },
        gridcolor: '#e5e7eb'
      },
      yaxis: { 
        title: { text: yCol, font: { size: 14 } },
        gridcolor: '#e5e7eb'
      },
      hovermode: 'closest',
      showlegend: colorCol ? true : false,
      plot_bgcolor: '#f9fafb',
      paper_bgcolor: '#ffffff',
      margin: { t: 60, r: 20, b: 60, l: 60 }
    };
    
    return { data: chartData, layout };
  };

  const generatePlotlyData = (data, chartType, xCol, yCol, colorCol, mode) => {
    if (chartType === 'pie') {
      return [{
        type: 'pie',
        labels: data.map(row => row[xCol]),
        values: data.map(row => row[yCol]),
        textinfo: 'label+percent',
        hovertemplate: '<b>%{label}</b><br>%{value:,.0f}<br>%{percent}<extra></extra>'
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
        mode: mode,
        name: String(name),
        x: values.x,
        y: values.y,
        hovertemplate: `<b>${name}</b><br>${xCol}: %{x}<br>${yCol}: %{y:,.2f}<extra></extra>`
      }));
    }
    
    return [{
      type: chartType,
      mode: mode,
      x: data.map(row => row[xCol]),
      y: data.map(row => row[yCol]),
      marker: { color: '#3b82f6', size: 8 },
      line: { color: '#3b82f6', width: 2 },
      hovertemplate: `${xCol}: %{x}<br>${yCol}: %{y:,.2f}<extra></extra>`
    }];
  };

  const generateChartTitle = (xCol, yCol, chartType) => {
    if (chartType === 'pie') return `Distribution of ${yCol}`;
    if (sqlQuery.toUpperCase().includes('GROUP BY')) return `${yCol} by ${xCol}`;
    if (xCol.toLowerCase().includes('year')) return `${yCol} Over Time`;
    return `${yCol} vs ${xCol}`;
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart;
    setSqlQuery(value);
    
    const currentWord = getCurrentWord(value, cursor);
    if (currentWord.length > 1) {
      const sugg = getSuggestions(currentWord);
      setSuggestions(sugg);
      setShowSuggestions(sugg.length > 0);
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
    const sugg = [];
    
    SQL_KEYWORDS.forEach(kw => {
      if (kw.startsWith(upper)) sugg.push(kw);
    });
    
    if (selectedDataset) {
      columns.forEach(col => {
        if (col.toLowerCase().startsWith(word.toLowerCase())) {
          sugg.push(col);
        }
      });
    }
    
    return sugg.slice(0, 10);
  };

  const applySuggestion = (suggestion) => {
    const cursor = textareaRef.current.selectionStart;
    const beforeCursor = sqlQuery.slice(0, cursor);
    const afterCursor = sqlQuery.slice(cursor);
    const currentWord = getCurrentWord(beforeCursor, cursor);
    const newBefore = beforeCursor.slice(0, -currentWord.length) + suggestion;
    setSqlQuery(newBefore + ' ' + afterCursor);
    setShowSuggestions(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const exportPNG = () => {
    if (!chartRef.current) return;
    Plotly.downloadImage(chartRef.current, {
      format: 'png',
      width: 1400,
      height: 900,
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
    
    const code = `"""
Our World in Data Analysis
Generated from SQL query
Dataset: ${selectedDataset.name}
"""

import pandas as pd
import plotly.express as px

# Load data from Our World in Data
df = pd.read_csv('${selectedDataset.url}')

# Execute SQL query (requires duckdb)
# pip install duckdb
import duckdb

con = duckdb.connect()
result = con.execute("""
${sqlQuery}
""").df()

# Display results
print(f"Query returned {len(result)} rows")
print(result.head())

# Create visualization
fig = px.line(
    result, 
    x='${queryResult.columns[0]}',
    y='${queryResult.columns[1] || queryResult.columns[0]}',
    title='${generateChartTitle(queryResult.columns[0], queryResult.columns[1] || queryResult.columns[0], 'line')}'
)
fig.show()
`;
    
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'owid_analysis.py';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadData = () => {
    if (!queryResult) return;
    
    const csv = [
      queryResult.columns.join(','),
      ...queryResult.data.map(row => 
        queryResult.columns.map(col => {
          const val = row[col];
          return typeof val === 'string' ? `"${val}"` : val;
        }).join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query_results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">🌍</span>
            <h1 className="text-3xl font-bold text-gray-800">
              Our World in Data SQL Analytics
            </h1>
          </div>
          <p className="text-gray-600">
            Query global datasets with real SQL powered by DuckDB • Intelligent visualizations • Export-ready results
          </p>
          {!db && (
            <div className="mt-4 flex items-center gap-2 text-yellow-700 bg-yellow-50 p-3 rounded-lg">
              <span>⏳</span>
              <span>Initializing SQL engine...</span>
            </div>
          )}
        </div>

        {loadingMessage && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 p-4 rounded-lg mb-6 flex items-center gap-3">
            <span>⏳</span>
            <span>{loadingMessage}</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 p-4 rounded-lg mb-6 flex items-start gap-3">
            <span>⚠️</span>
            <div className="flex-1">{error}</div>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-300 text-green-700 p-4 rounded-lg mb-6 flex items-center gap-3">
            <span>✓</span>
            <span>{success}</span>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-100">
          <h2 className="text-xl font-bold mb-4 text-gray-800">Select Dataset</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DATASETS.map(dataset => (
              <button
                key={dataset.id}
                onClick={() => loadDataset(dataset)}
                disabled={!db || loading}
                className={`p-5 rounded-xl border-2 transition-all text-left ${
                  selectedDataset?.id === dataset.id
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className="font-bold text-gray-800 mb-2">{dataset.name}</div>
                <div className="text-sm text-gray-600">{dataset.description}</div>
              </button>
            ))}
          </div>
        </div>

        {selectedDataset && (
          <>
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">SQL Query Editor</h2>
                <div className="text-sm text-gray-500">
                  {columns.length} columns available
                </div>
              </div>
              
              <div className="relative mb-4">
                <textarea
                  ref={textareaRef}
                  value={sqlQuery}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      executeQuery();
                    }
                  }}
                  className="w-full h-40 p-4 font-mono text-sm border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none bg-gray-50 resize-none"
                  placeholder="Enter your SQL query... (Ctrl+Enter to execute)"
                />
                {showSuggestions && (
                  <div className="absolute z-10 mt-1 bg-white border-2 border-blue-300 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {suggestions.map((sug, idx) => (
                      <div
                        key={idx}
                        onClick={() => applySuggestion(sug)}
                        className="px-4 py-2 hover:bg-blue-50 cursor-pointer font-mono text-sm border-b last:border-b-0"
                      >
                        {sug}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={executeQuery}
                  disabled={loading || !db}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 font-semibold shadow-md transition-all"
                >
                  ▶ {loading ? 'Executing...' : 'Run Query'}
                </button>
                
                <div className="text-sm text-gray-500 flex items-center px-3">
                  Press <kbd className="px-2 py-1 bg-gray-200 rounded mx-1">Ctrl+Enter</kbd> to execute
                </div>
              </div>
            </div>

            {queryResult && (
              <>
                <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-100">
                  <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
                    <h2 className="text-xl font-bold text-gray-800">Visualization</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={exportPNG}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-semibold shadow-md"
                      >
                        📊 PNG
                      </button>
                      <button
                        onClick={exportSVG}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-semibold shadow-md"
                      >
                        📄 SVG
                      </button>
                      <button
                        onClick={exportNotebook}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-semibold shadow-md"
                      >
                        💻 Python
                      </button>
                      <button
                        onClick={downloadData}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold shadow-md"
                      >
                        💾 CSV
                      </button>
                    </div>
                  </div>
                  <div ref={chartRef} className="w-full" style={{ height: '500px' }} />
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                  <h2 className="text-xl font-bold mb-4 text-gray-800">
                    Query Results ({queryResult.data.length.toLocaleString()} rows)
                  </h2>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          {queryResult.columns.map(col => (
                            <th key={col} className="px-4 py-3 text-left font-bold text-gray-700 border-b-2 border-gray-300">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {queryResult.data.slice(0, 500).map((row, idx) => (
                          <tr key={idx} className="border-b hover:bg-blue-50 transition-colors">
                            {queryResult.columns.map(col => (
                              <td key={col} className="px-4 py-2 text-gray-700">
                                {typeof row[col] === 'number' 
                                  ? row[col].toLocaleString(undefined, { maximumFractionDigits: 2 })
                                  : String(row[col] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {queryResult.data.length > 500 && (
                      <div className="p-4 text-center text-gray-500 bg-gray-50 border-t">
                        Showing first 500 rows. Download CSV for complete results.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <div className="mt-8 text-center text-gray-500 text-sm">
          <p>Powered by DuckDB-WASM • Data from Our World in Data • Visualizations by Plotly</p>
          <p className="mt-1">Full SQL support: JOIN, GROUP BY, subqueries, window functions, and more!</p>
        </div>
      </div>
    </div>
  );
}

ReactDOM.render(<OWIDAnalytics />, document.getElementById('root'));
