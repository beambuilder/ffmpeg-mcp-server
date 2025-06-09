# ffmpeg-mcp-server

A Model Context Protocol (MCP) server for automated video editing with FFmpeg.  
Designed for use with Claude Desktop to cut highlights from long livestreams into concise highlight reels.

## Features

- **extract_video_segment**: Cut specific segments from your video.
- **concatenate_videos**: Join multiple video segments together.
- **get_video_info**: Get details about your video (duration, resolution, etc.).
- **create_highlights_reel**: One-command solution to create a highlights reel from multiple segments.

## Requirements

- [Node.js](https://nodejs.org/) (v18+)
- [FFmpeg](https://ffmpeg.org/) and [ffprobe](https://ffmpeg.org/ffprobe.html) (install via Homebrew: `brew install ffmpeg`)

## Installation

```sh
brew install ffmpeg
npm install
chmod +x server.js
```

## Usage

Start the MCP server:

```sh
./server.js
```

or

```sh
npm start
```

The server communicates via stdio and is intended to be used as a backend for Claude Desktop or other MCP clients.

## MCP Tools

- **extract_video_segment**: Extract a segment from a video file using start and end timestamps.
- **concatenate_videos**: Concatenate multiple video files into one.
- **get_video_info**: Get information about a video file (duration, resolution, etc.).
- **create_highlights_reel**: Create a highlights reel from multiple timestamp segments.

## Claude Desktop Integration

Add this to your Claude Desktop MCP configuration:

```json
{
  "name": "FFmpeg MCP Server",
  "command": ["node", "server.js"],
  "cwd": "/path/to/your/ffmpeg-mcp-server"
}
```

Replace `/path/to/your/ffmpeg-mcp-server` with the actual path to this project on your machine.

## Run with Docker

If you prefer to use Docker:

```sh
docker build -t ffmpeg-mcp-server .
docker run --rm -it -v "$PWD":/app ffmpeg-mcp-server
```

This will build and run the server in a container with FFmpeg and Node.js pre-installed.

## Conda Environment

It is recommended to use a dedicated conda environment for this project:

```sh
conda activate ffmpegmcp
```

Make sure to activate this environment before installing dependencies or running the server.

## License

MIT
