# FreeShow Formatter

A desktop application that allows you to process text using Python scripts. Perfect for formatting FreeShow presentations, bulk processing, and custom text transformations.

## Features

- **Python Script Execution**: Run custom Python scripts to process your text
- **Simple Interface**: Clean, modern UI for selecting scripts and inputting text
- **Error Handling**: Clear error messages when scripts fail
- **Real-time Output**: See results instantly after script execution

## Requirements

- Python 3.x installed and available in your PATH (as `python` or `python3`)
- Node.js and npm (for development)
- Rust (for building the Tauri app)

## Development

### Install Dependencies

```bash
npm install
```

### Run in Development Mode

```bash
npm run tauri dev
```

### Build for Production

```bash
npm run tauri build
```

## Usage

1. **Select a Python Script**: Click "Select Python Script" and choose a `.py` file
2. **Enter Input Text**: Type or paste your text into the input area
3. **Execute**: Click "Execute Script" to run your Python script
4. **View Output**: The processed text will appear in the output area

## Python Script Format

Your Python scripts should:
- Read input from `stdin`
- Process the text as needed
- Write output to `stdout`

### Example Script

See `example_script.py` for a simple example that converts text to uppercase.

```python
import sys

def process_text(text):
    # Your processing logic here
    return text.upper()

if __name__ == "__main__":
    input_text = sys.stdin.read()
    output_text = process_text(input_text)
    print(output_text, end='')
```

## Future Features

- **Bulk Mode**: Process multiple files at once
- **File Mode**: Direct file input/output
- **Script Library**: Save and reuse favorite scripts
- **Template System**: Pre-built templates for common tasks

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).
