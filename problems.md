# 📝 Problem Data Structure

This document defines the JSON schema for adding new problems to DynoCode. Problems live in `problems/` at the repo root, one JSON file per module:

```
problems/
  basics.json
  control-flow.json
  functions.json
  lists.json
  loops.json
  strings.json
```

Each file is a top-level array of problem objects. The backend reads every `*.json` in this directory at startup, validates them, and indexes by `id`. To add a new module, just create a new file (e.g. `problems/dictionaries.json`).

## 🏗 Schema Overview

Each problem is an object in a top-level array.

```json
{
  "id": 1,
  "module": "Basics",
  "moduleOrder": 1,
  "order": 1,
  "difficulty": "easy",
  "title": "Hello World",
  "description": "Write a program that prints **Hello, World!**...",
  "concepts": ["print"],
  "conceptLesson": {
    "title": "The print() Function",
    "content": "Explanation text here...",
    "code": "print('example')"
  },
  "hints": ["Hint 1", "Hint 2"],
  "solution": "print('Hello, World!')",
  "examples": [
    { "input": "", "output": "Hello, World!" }
  ],
  "testCases": [
    { "input": "", "expectedOutput": "Hello, World!" }
  ],
  "starterCode": "# Write your code here\n"
}
```

## 🔑 Field Definitions

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `Integer` | Unique identifier for the problem. |
| `module` | `String` | The category name (e.g., "Loops"). |
| `moduleOrder` | `Integer` | Sorting order for the module in the sidebar. |
| `order` | `Integer` | Sorting order for the problem within its module. |
| `difficulty` | `String` | `"easy"`, `"medium"`, or `"hard"`. |
| `title` | `String` | Display name of the problem. |
| `description` | `String` | Problem statement. Supports **bold** and `inline code`. |
| `concepts` | `Array` | List of concept tags (strings). |
| `conceptLesson` | `Object` | (Optional) Tiny tutorial shown at the top of the problem. |
| `hints` | `Array` | List of strings unlocked progressively by the user. |
| `solution` | `String` | The reference Python solution. |
| `examples` | `Array` | List of `{input, output}` objects for the UI. |
| `testCases` | `Array` | Hidden cases used for validation: `{input, expectedOutput}`. |
| `starterCode` | `String` | Code pre-filled in the editor. |

## 💡 Best Practices

1. **Test Cases**: Always include edge cases (empty strings, large numbers, negative values).
2. **Descriptions**: Keep them concise. Use `\n` for new lines.
3. **conceptLesson**: Make the code snippet simple and directly related to the problem.
4. **Starter Code**: Use comments to guide the user on where to write their solution.
