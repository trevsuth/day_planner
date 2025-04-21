# Run the test suite
test:
    PYTHONPATH=app pytest 

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
