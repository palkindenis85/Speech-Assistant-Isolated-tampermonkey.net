# Speech Assistant Isolated

Speech Assistant Isolated is a powerful JavaScript browser script that adds smart voice notepad functionality with speech recognition, voice control, and AI text processing.


## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Voice Commands](#voice-commands)
- [Settings](#settings)
- [AI Text Processing](#ai-text-processing)
- [Hotkeys](#hotkeys)
- [Supported Languages](#supported-languages)
- [Technical Details](#technical-details)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Voice Recognition**: Convert speech to text using browser's Web Speech API
- **Voice Control**: Control the notepad with voice commands
- **Multilingual Support**: Recognition and interface in Russian, English, Ukrainian, and Czech
- **AI Text Processing**: Integration with GPT and Google Gemini for text processing and enhancement
- **Text-to-Speech**: Function to read selected text through OpenAI API
- **Automatic Punctuation**: Voice commands for adding punctuation marks
- **History Saving**: Ability to save texts and work with them later
- **Custom Commands**: Create your own voice commands
- **Hotkeys**: Quick access to functions through keyboard shortcuts
- **Isolated Operation**: No conflicts with other scripts on the page

## Installation

### Through a User Script Manager

1. Install a user script manager:
   - [Tampermonkey](https://www.tampermonkey.net/) for Chrome, Edge, Safari, Opera Next, and Firefox
   - [Greasemonkey](https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/) for Firefox
   - [Violentmonkey](https://violentmonkey.github.io/) for Chrome, Edge, Firefox, and Opera

2. Install the script:
   - [Click here to install](https://github.com/yourusername/speech-assistant-isolated/raw/master/speech-assistant-isolated.user.js)
   - Or open the `speech-assistant-isolated.user.js` file and click "Install" in your script manager

### Manual Installation

1. Copy the contents of the `speech-assistant-isolated.user.js` file
2. Open your user script manager dashboard
3. Create a new script
4. Paste the copied code
5. Save the script

## Usage

After installing the script, a microphone button will appear in the bottom right corner of all pages. Click it to open the voice notepad panel.

### Basic Functions

- **Speech Recording**: Click the "Start Recording" button to begin speech recognition
- **Pause/Continue**: Pause and resume recording
- **Copy Text**: Copy all text to clipboard
- **Save**: Save text for later use
- **AI Processing**: Send text for processing to GPT or Google Gemini

### Voice Commands

To activate a voice command, say the activation word (default is "computer") followed by the command. For example:

```
"Computer, period"
```

#### Available Commands

| Command | Action |
|---------|--------|
| clear | Clears all text in the notepad |
| copy | Copies text to clipboard |
| save | Saves text and closes the window |
| stop | Stops recording |
| pause | Pauses recording |
| continue | Resumes recording |
| process | Sends text for AI processing |

#### Punctuation Commands

| Command | Action |
|---------|--------|
| period | Adds a period (.) |
| comma | Adds a comma (,) |
| question mark | Adds a question mark (?) |
| exclamation mark | Adds an exclamation mark (!) |
| colon | Adds a colon (:) |
| new line | Starts a new line |
| capitalize | The next word will be capitalized |

### Special Instructions for AI

You can also pass special instructions for AI processing. Say the activation word followed by text that is not a command:

```
"Computer, remember this is important for analysis"
```

This will write to the notepad: `{remember this is important for analysis}`, and this text in curly braces will serve as an instruction for AI during processing.

## Settings

To access settings, click the "Settings" button in the notepad panel.

### Basic Settings

- **API Keys**: Configure keys for OpenAI, GPT, and Google Gemini
- **Recognition Language**: Select language for speech recognition
- **Activation Word**: Change the word for command activation
- **Font Settings**: Family, size, weight, and line height
- **Sites for TTS**: List of sites where the text reading function will be available
- **Dark Theme**: Toggle between light and dark themes

### AI Settings

- **AI Provider Selection**: Choose between GPT and Google Gemini
- **Request Parameters**: Temperature, maximum tokens
- **Prompts**: Configure system and main prompts for text processing
- **Number of Messages from History**: Configure context for AI

### Custom Commands

You can create your own voice commands by opening the "Custom Commands" section in settings.

## AI Text Processing

Speech Assistant Isolated allows processing text using AI:

1. Enter or dictate text into the notepad
2. Click the "Send to AI" button
3. Choose the provider (GPT or Google Gemini)
4. Get the processed text in the "AI Processing" tab

Text processing functions:
- Correcting recognition errors
- Adding punctuation
- Structuring text
- Following instructions in curly braces

## Hotkeys

| Key Combination | Action |
|-----------------|--------|
| Ctrl+Shift+S | Open voice notepad panel |
| Ctrl+A (in panel) | Go to AI tab |
| Space (during recording) | Pause/Continue recording |

## Supported Languages

- Russian
- English (US and UK)
- Ukrainian
- Czech

Each language has a corresponding interface and set of voice commands.

## Technical Details

### Browser Requirements

- Browser with Web Speech API support (Chrome, Edge, Safari, Firefox)
- Installed user script manager
- Microphone access
- Internet connection for AI and TTS functions

### APIs Used

- Web Speech API for speech recognition
- OpenAI API for TTS and GPT
- Google Gemini API for text processing
- DOM API for interface manipulations

### Security

- All API keys are stored locally in browser storage
- Data is not sent to third-party servers except official APIs
- Uses DOMPurify for XSS protection
- Trusted Types for security in modern browsers

## Contributing

We welcome contributions to the project! If you want to contribute:

1. Fork the repository
2. Create a branch for your changes
3. Make changes and test them
4. Submit a Pull Request with a detailed description of changes

### Bug Reports

If you find a bug, please create an Issue on GitHub with a detailed description:
- Steps to reproduce the bug
- Expected behavior
- Actual behavior
- Screenshots (if applicable)
- Information about your browser and operating system

## License

This project is distributed under the MIT license. Details in the [LICENSE](LICENSE) file.

---

Developed by [Palkin Denys](https://github.com/yourusername).

If you have questions or suggestions, create an Issue on GitHub or contact the author directly.