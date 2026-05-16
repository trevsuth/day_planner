# Run the test suite
test:
    pytest

# Run the API server for the React frontend
api:
    uv run uvicorn app.api:app --reload

# Run the React development server
web:
    npm --prefix web run dev

# Build the React frontend
web-build:
    npm --prefix web run build

# Format the code with ruff
format:
    uvx ruff format .

# Lint code with ruff
lint:
    uvx ruff check . --fix

# Build a standalone executable
build:
    pyinstaller planner.spec
# Clean up build artifacts
clean:
    rm -rf build dist __pycache__

# Rebuild from scratch
rebuild: clean build
