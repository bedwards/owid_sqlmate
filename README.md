# OWID SQLMate

A fully functional SQL analytics platform for Our World in Data with intelligent chart generation and multiple export options!I've created a fully functional **Our World in Data SQL Analytics Platform** with:

## Queries that work

### Simple query

```
SELECT * FROM energy_data WHERE country = 'United States' LIMIT 100
```

### List countries

```
SELECT country FROM energy_data GROUP BY country
```

### Complex aggregations

```
SELECT country, AVG(coal_consumption) as avg_coal
FROM energy_data
WHERE year >= 2010
AND iso_code IS NOT NULL 
AND LENGTH(iso_code) = 3
AND iso_code NOT LIKE '%OWID%'
GROUP BY country 
ORDER BY avg_coal DESC 
LIMIT 20
```

![chart-agg](chart-agg.png)

### Window functions!

```
SELECT country, year, gdp,
       AVG(gdp) OVER (PARTITION BY country ORDER BY year ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) as moving_avg
FROM energy_data
WHERE country IN ('United States', 'China', 'Germany')
```

![chart-window](chart-window.png)

### Literacy

```
SELECT * FROM literacy WHERE Entity = 'India'
```

### CO2

```
SELECT year, co2_growth_prct FROM co2_data WHERE country = 'India'
```

## Claude session

[Transcript](claude.pdf) 89-page PDF!!!

## ✨ Key Features

**1. SQL Interface with Auto-complete**
- Real-time suggestions for SQL keywords and column names
- Smart completion as you type

**2. Intelligent Chart Generation**
- Automatically detects data types (numeric, categorical, temporal)
- Chooses optimal chart type (line, bar, scatter, pie) based on query patterns
- Smart axis selection and labeling
- Interactive tooltips with rich HTML formatting

**3. Multiple Export Options**
- **PNG**: High-resolution image export
- **SVG**: Vector graphics for publications
- **Python Notebook**: Generates ready-to-use Kaggle/Colab code

**4. Real OWID Datasets**
- CO2 & Greenhouse Gas Emissions
- COVID-19 data
- Energy data
- Loads directly from Our World in Data repositories

**YES!** You can use ANY OWID dataset from their GitHub repositories! Here are the main ones:

## 📊 Available OWID Datasets:

### **Already in the app:**
1. `co2_data` - CO2 and greenhouse gas emissions
2. `energy_data` - Energy production and consumption
3. `covid_data` - COVID-19 pandemic data

### **Other major datasets you can add:**

**Climate & Environment:**
- `https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Natural%20disasters%20-%20EM-DAT/Natural%20disasters%20-%20EM-DAT.csv`

**Health:**
- Life expectancy: `https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Life%20expectancy%20at%20birth%20(Gapminder%2C%20UN)/Life%20expectancy%20at%20birth%20(Gapminder%2C%20UN).csv`
- Mortality rates: Various causes available

**Economics:**
- GDP data: `https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/GDP%20per%20capita%20(Maddison%202020)/GDP%20per%20capita%20(Maddison%202020).csv`

**To add any dataset**, just add it to the `DATASETS` array in `app.js`:

```javascript
const DATASETS = [
  // ... existing datasets ...
  { 
    id: 'life_expectancy',
    name: 'Life Expectancy',
    url: 'https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Life%20expectancy%20at%20birth%20(Gapminder%2C%20UN)/Life%20expectancy%20at%20birth%20(Gapminder%2C%20UN).csv',
    description: 'Life expectancy at birth by country',
    tableName: 'life_expectancy'
  }
];
```

## 🚀 Deployment Instructions

### **GitHub Pages** (Recommended)

1. Create a new repository on GitHub
2. Create `index.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>OWID SQL Analytics</title>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="./app.js"></script>
</body>
</html>
```

3. Save the React code as `app.js` (convert JSX to plain JS or use a bundler)
4. Go to Settings → Pages → Deploy from main branch

### **Cloudflare Pages**

1. Push code to GitHub
2. Connect repository to Cloudflare Pages
3. Build command: `npm run build` (if using a bundler)
4. Deploy!

The application is **100% client-side**, loads data directly from OWID GitHub repositories, and requires no backend server - perfect for free hosting! 🎉

![logo](logo-256.png)

![image](image-256.png)

![image](image-512.png)

![image](image.png)
