# Coin DS Assistant

## Overview
Coin DS Assistant is a Figma plugin designed to help you manage your Design System efficiently. It scans your published component sets, generates Markdown documentation for your components, and supports exporting documentation as single or multiple files. The plugin features a multi-tab interface that allows you to switch between different tools, with more functionality coming soon.

## Features
- Scan all published component sets in your Figma workspace.
- Generate Markdown documentation for your Design System components.
- Export documentation as a single file or multiple files.
- Filter and search through components for easier navigation.
- Tabbed interface to access different tools within the plugin.
- Additional tools and features planned for future releases.

## Installation (Development)
To install the plugin locally for development:
1. Open Figma and go to the **Plugins** menu.
2. Select **Development > Import Plugin from Manifest...**
3. Choose the `manifest.json` file located in the root of this project.
4. The plugin will now be available in your Figma plugins list for testing and development.

## Usage
- Run the plugin from the Figma **Plugins** menu.
- Use the tabbed interface to switch between different tools.
- Scan your published component sets using the available scan button.
- Filter and search through components to find what you need.
- Export your Design System documentation as Markdown files, either as a single file or multiple files.

## Development Setup
This plugin uses TypeScript and NPM for development.

1. Install [Node.js](https://nodejs.org/en/download/) (which includes NPM).
2. Install TypeScript globally by running:
   ```
   npm install -g typescript
   ```
3. In the plugin directory, install the Figma plugin typings:
   ```
   npm install --save-dev @figma/plugin-typings
   ```
4. Open the project folder in Visual Studio Code.
5. Compile TypeScript to JavaScript by running the build task:
   - Use the menu: **Terminal > Run Build Task...**
   - Select **npm: watch** to automatically compile on save.

For more information about TypeScript, visit [https://www.typescriptlang.org/](https://www.typescriptlang.org/).

## Folder Structure
- `manifest.json`: Defines the plugin's metadata and permissions.
- `code.ts` / `code.js`: The main plugin code that runs in Figma.
- `ui.html`: The user interface for the plugin.
- `assets/`: Folder containing images, icons, and other static files used by the plugin.

## License
This project is licensed under the MIT License.
