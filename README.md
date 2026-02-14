# BreatheMap

BreatheMap is a web application for visualizing and analyzing air quality data across Europe. It provides interactive maps, analytics, and downloadable tables to help users explore pollution trends, health risks, and compliance with air quality standards in multiple countries.

## Features

- Interactive map of air quality metrics (PM2.5, PM10) across 8 European countries
- Downloadable analytics tables and summary statistics
- Health risk and compliance analysis
- Modern web UI with Flask backend and static assets
- Ready for deployment on Vercel or any Python web host

## Folder Structure

- `app.py` — Flask application backend serving data and web pages
- `index.html` — Main web page (Jinja2/Flask template)
- `assets/` — Static files (CSS, JS, images, fonts)
- `results/` — Precomputed analytics tables (CSV, Parquet)
- `tables/` — Additional analytics tables for web app
- `requirements.txt` — Python dependencies
- `vercel.json` — Vercel deployment configuration

## Data Sources

The application uses precomputed CSV and Parquet files in the `results/` and `tables/` folders. These include:

- Air quality metrics (PM2.5, PM10)
- Health risk days
- WHO compliance tables
- Seasonal and yearly trends
- Summary statistics

## Running Locally

1. Install dependencies:
	```bash
	pip install -r requirements.txt
	```
2. Run the Flask app:
	```bash
	python app.py
	```
3. Open your browser at [http://localhost:5000](http://localhost:5000)

## Deployment

BreatheMap is ready for deployment on Vercel (see `vercel.json`). You can also deploy on any platform that supports Python and Flask.

## License

MIT License. See LICENSE file if present.

---
For questions or contributions, please open an issue or pull request.