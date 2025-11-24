from flask import Flask, render_template
import os

# Create a Flask app that serves static files from the existing `assets` folder
# and renders `index.html` located in the same directory as this file.
app = Flask(
    __name__,
    static_folder="assets",
    static_url_path="/static",
    template_folder="."
)


@app.route("/")
def index():
    return render_template("index.html")


if __name__ == "__main__":
    # Use 0.0.0.0 for external access; change debug as needed
    # app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
    app.run()
