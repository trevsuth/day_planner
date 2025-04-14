# Run the test suite
test:
    PYTHONPATH=app pytest 

# Format the code with ruff
format:
    ruff format .

# Lint code with ruff
lint:
    ruff check .
