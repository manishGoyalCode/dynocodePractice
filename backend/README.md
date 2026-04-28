# ⚡ DynoCode Backend

The FastAPI-based backend for the DynoCode practice platform. It manages problem data and provides a secure execution environment for Python code.

## 🚀 Getting Started

### Prerequisites
- Python 3.8+
- `pip`

### Installation
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Running the Server
Start the development server with auto-reload:
```bash
python3 -m uvicorn main:app --port 8000 --reload
```
The API will be available at `http://localhost:8000`.

## 🛠 Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/problems` | Returns a list of all problems (metadata only). |
| `GET` | `/problems/{id}` | Returns detailed data for a specific problem. |
| `POST` | `/run` | Executes user code with custom `stdin` input. |
| `POST` | `/submit` | Validates user code against all hidden test cases. |

## 🔒 Code Execution Security
- Code is executed in a isolated `subprocess`.
- **Timeout**: Each execution is capped at 2 seconds to prevent infinite loops.
- **Error Handling**: Intercepts `EOFError` and common runtime errors to provide user-friendly feedback.

## 📂 Data Structure
The backend loads problems from the root `problems.json` file. See the documentation at the project root for the schema details.
