# ffmpeg-mcp-server

A Model Context Protocol (MCP) server for speeding up videos with FFmpeg.  
Designed for use with Claude Desktop to quickly speed up MP4 videos.

## Features

- **speed_up_video**: Speed up any video file by a specified factor (e.g., 50x faster)

## Requirements

### Local Installation

- [Node.js](https://nodejs.org/) (v18+)
- [FFmpeg](https://ffmpeg.org/)

### Docker Installation

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (FFmpeg is included in the container)

## Installation

### Local Setup

```sh
# Install FFmpeg (Windows - via chocolatey)
choco install ffmpeg

# Install dependencies
npm install
```

### Docker Setup

```sh
# No FFmpeg installation needed - it's included in the container
npm install  # Only needed if you want to develop locally too
```

## Configuration

To configure the folder where your video files are located, set the `VIDEO_FOLDER` environment variable in your Claude Desktop configuration.

Example Claude Desktop config (modify the path to your video folder):
```json
{
  "mcpServers": {
    "ffmpeg-mcp-server": {
      "command": "node",
      "args": ["C:\\Users\\Niclas\\Desktop\\ffmpeg-mcp-server\\server.js"],
      "env": {
        "VIDEO_FOLDER": "D:\\testffmpegmcp"
      }
    }
  }
}
```

## Usage

The server will automatically start when Claude Desktop loads. You can then use the `speed_up_video` function by providing:
- `filename`: The name of the video file (e.g., "GX010412.MP4")
- `speed_factor`: How much to speed up (e.g., 50 for 50x speed)
- `output_suffix` (optional): Custom suffix for output file (defaults to "x{speed_factor}")

Example command structure that gets executed:
```
ffmpeg -i "D:\testffmpegmcp\GX010412.MP4" -filter:v "setpts=0.02*PTS" -r 30 -an -c:v mpeg4 -q:v 5 "D:\testffmpegmcp\GX010412x50.MP4"
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
