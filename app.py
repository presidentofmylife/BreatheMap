import pandas as pd
import json
import os
import numpy as np
from flask import Flask, render_template

app = Flask(
    __name__,
    static_folder="assets", 
    static_url_path="/static",
    template_folder="."
)

class NpEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super(NpEncoder, self).default(obj)

def get_analytics_data():
    data = {}
    
    # Check for tables directory or current directory
    if os.path.exists("tables") and os.path.isdir("tables"):
        base_path = "tables/"
    else:
        base_path = ""

    def clean_list(lst):
        # Ensure NaNs become nulls for JSON serialization
        return [x if not pd.isna(x) else None for x in lst]

    def load_csv(filename):
        path = os.path.join(base_path, filename)
        if os.path.exists(path):
            try:
                return pd.read_csv(path)
            except:
                return None
        return None

    # =========================================================
    # PART 1: ORIGINAL ANALYTICS (Charts 1-6)
    # =========================================================

    # 1. Summary Statistics (Chart 1: Mean Comparison)
    df = load_csv("summary_statistics.csv")
    if df is not None:
        try:
            df = df.sort_values('country')
            pm25 = df[df['pollutant_name'] == 'PM2.5']
            pm10 = df[df['pollutant_name'] == 'PM10']
            data['summary'] = {
                'countries': pm25['country'].tolist(),
                'pm25': clean_list(pm25['mean'].tolist()),
                'pm10': clean_list(pm10['mean'].tolist())
            }
        except: pass

    # 2. WHO Compliance (Chart 2: Horizontal Bar)
    # Note: Using your new 'table_who_compliance.csv' which is better than the old calculation
    df = load_csv("table_who_compliance.csv")
    if df is not None:
        try:
            pm25 = df[df['pollutant_name'] == 'PM2.5'].sort_values('who_compliance_pct')
            data['compliance'] = {
                'countries': pm25['country'].tolist(),
                'pct': clean_list(pm25['who_compliance_pct'].tolist())
            }
        except: pass

    # 3. Monthly Patterns (Chart 3: Line Chart)
    # *Note: Only works if you saved 'table_monthly_patterns.csv' via the fix I gave you*
    df = load_csv("table_monthly_patterns.csv") 
    if df is not None:
        try:
            countries = df['country'].unique()
            seasonal_data = {}
            for c in countries:
                c_data = df[(df['country'] == c) & (df['pollutant_name'] == 'PM10')].sort_values('month_num')
                # Align to 12 months
                vals = c_data.set_index('month_num').reindex(range(1, 13))['avg_concentration']
                seasonal_data[c] = clean_list(vals.tolist())
            data['monthly_patterns'] = seasonal_data
        except: pass

    # 4 & 5. Seasonal AQI (Charts 4 & 5: Doughnuts)
    df = load_csv("table_seasonal_aqi.csv")
    if df is not None:
        try:
            labels = ["Good", "Fair", "Moderate", "Poor", "Very Poor", "Extremely Poor"]
            def get_season_avg(season):
                d = df[(df['season_4'] == season) & (df['pollutant_name'] == 'PM2.5')]
                agg = d.groupby('aqi_category')['percentage'].mean().reindex(labels).fillna(0)
                return clean_list(agg.tolist())

            data['aqi_winter'] = get_season_avg('Winter')
            data['aqi_summer'] = get_season_avg('Summer')
            data['aqi_labels'] = labels
        except: pass

    # 6. PM Ratio (Chart 6: Bar)
    df = load_csv("table6_pm_ratio.csv") # Try old name
    if df is None: df = load_csv("table_pm_ratio.csv") # Try new name
    if df is not None:
        try:
            data['ratio'] = {
                'countries': df['country'].tolist(),
                'values': clean_list(df['mean_ratio'].tolist())
            }
        except: pass

    # =========================================================
    # PART 2: ADVANCED ANALYTICS (New Charts)
    # =========================================================

    # 7. Model Performance (New Table/Chart)
    # Checks for both filename possibilities
    df = load_csv("country_performance_pm25.csv") 
    if df is None: df = load_csv("PM2_5_BELGIUM_CZECH_GERMANY_ITALY_POLAND_SPAIN_SWEDEN_UK_country_performance.csv")
    if df is not None:
        data['model_performance'] = df.to_dict(orient='records')

    # 8. Health Risk Days (New Chart)
    df = load_csv("table_health_risk_days.csv")
    if df is not None:
        try:
            pm25 = df[df['pollutant_name'] == 'PM2.5'].sort_values('risk_days_pct', ascending=False)
            data['health_risk'] = {
                'countries': pm25['country'].tolist(),
                'pct': clean_list(pm25['risk_days_pct'].tolist())
            }
        except: pass

    # 9. Excess Mortality Risk (New Chart)
    df = load_csv("table_excess_mortality_risk.csv")
    if df is not None:
        try:
            pm25 = df[df['pollutant_name'] == 'PM2.5'].sort_values('avg_excess_risk_pct', ascending=False)
            data['mortality'] = {
                'countries': pm25['country'].tolist(),
                'risk': clean_list(pm25['avg_excess_risk_pct'].tolist())
            }
        except: pass

    # 10. Yearly Trends (New Line Chart)
    df = load_csv("table_yearly_aqi_trends.csv")
    if df is not None:
        try:
            years = sorted(df['year_num'].unique())
            trends = {}
            # Filter top 5 countries to avoid cluttering the chart
            for c in df['country'].unique():
                c_data = df[(df['country'] == c) & (df['pollutant_name'] == 'PM2.5')].sort_values('year_num')
                c_data_idx = c_data.set_index('year_num').reindex(years).fillna(0)
                trends[c] = clean_list(c_data_idx['avg_aqi'].tolist())
            data['yearly_trends'] = {'years': clean_list(years), 'data': trends}
        except: pass

    # 11. Weekend Effect (New Chart)
    df = load_csv("table_weekend_aqi.csv")
    if df is not None:
        try:
            weekend_data = {}
            for c in df['country'].unique():
                c_data = df[(df['country'] == c) & (df['pollutant_name'] == 'PM2.5')]
                # Safe access
                wknd = c_data[c_data['is_weekend'] == 'Weekend']['avg_aqi'].mean() if not c_data[c_data['is_weekend'] == 'Weekend'].empty else 0
                wkday = c_data[c_data['is_weekend'] == 'Weekday']['avg_aqi'].mean() if not c_data[c_data['is_weekend'] == 'Weekday'].empty else 0
                weekend_data[c] = {'weekend': wknd, 'weekday': wkday}
            data['weekend_effect'] = weekend_data
        except: pass

    # 12. Worst Episodes (New Table)
    df = load_csv("table_worst_episodes.csv")
    if df is not None:
        data['worst_episodes'] = df.head(10).to_dict(orient='records')

    print(f"Keys Loaded: {list(data.keys())}")
    return data

@app.route('/')
def index():
    json_data = json.dumps(get_analytics_data(), cls=NpEncoder)
    print(json_data)
    return render_template('index.html', analytics_data=json_data)

if __name__ == "__main__":
    app.run(debug=True)