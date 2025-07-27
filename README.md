# ffmpeg-mcp-server

A Model Context Protocol (MCP) server for advanced video processing with FFmpeg.  
Designed for use with Claude Desktop to perform various video operations including speed adjustment, keyframe optimization, concatenation, and file management.

## Features

- **speed_up_video**: Speed up any video file by a specified factor (e.g., 50x faster)
- **increase_keyframes**: Increase keyframe density by setting GOP (Group of Pictures) values
- **concatenate_videos**: Combine multiple video files into a single output video
- **get_files_info**: List all files in your video folder with sizes and modification dates
- **check_processing_status**: Monitor background processing jobs for large files

## Smart Processing

- **Automatic file size detection**: Files > 1GB are processed in the background to prevent timeouts
- **Background processing**: Large files start processing immediately without blocking Claude
- **Status monitoring**: Track progress of all processing jobs
- **Time estimation**: Get estimated completion times for large file operations

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

Configure the folder where your video files are located by setting the `VIDEOS_PATH` environment variable in your Claude Desktop configuration.

Example Claude Desktop config (modify the path to your video folder):
```json
{
  "mcpServers": {
    "ffmpeg-mcp-server": {
      "command": "node",
      "args": ["C:\\Users\\Niclas\\Desktop\\ffmpeg-mcp-server\\server.js"],
      "env": {
        "VIDEOS_PATH": "D:\\testffmpegmcp"
      }
    }
  }
}
```

## Available Functions

### 🚀 speed_up_video
Speed up videos by any factor while removing audio for optimal performance.

**Parameters:**
- `filename`: Video file name (e.g., "GX010412.MP4")
- `speed_factor`: Speed multiplier (e.g., 50 for 50x speed)
- `output_suffix`: Optional custom suffix (defaults to "x{speed_factor}")

**Example command executed:**
```
ffmpeg -i "input.MP4" -filter:v "setpts=0.02*PTS" -r 30 -an -c:v mpeg4 -q:v 5 "output_x50.MP4"
```

### 🎯 increase_keyframes
Optimize video keyframe density for better seeking and editing performance.

**Parameters:**
- `filename`: Video file name
- `gop_value`: GOP value (1 = keyframe every frame, 30 = every 30th frame)
- `output_suffix`: Optional custom suffix (defaults to "_gop{value}")

**Example command executed:**
```
ffmpeg -i "input.mp4" -c:v libx264 -g 1 -c:a copy "output_gop1.mp4"
```

### 🔗 concatenate_videos
Combine multiple video files into one seamless output.

**Parameters:**
- `video_files`: Array of video filenames in order
- `output_filename`: Name for the combined output file

**Process:**
1. Creates temporary `concat_list.txt` file
2. Executes: `ffmpeg -f concat -safe 0 -i concat_list.txt -c copy output.mp4`
3. Automatically cleans up temporary files

### 📁 get_files_info
List all files in your video directory with detailed information.

**Returns:**
- File names, sizes (human-readable), and modification dates
- Sorted by newest first
- Only shows actual files (ignores directories)

### 📊 check_processing_status
Monitor all background processing operations.

**Shows:**
- Active jobs with duration and file size
- Recently completed jobs
- Failed jobs with error details
- Automatic cleanup of old completed jobs

## Usage Examples

### Small Files (< 1GB)
Processed immediately with instant response:
```
User: "Speed up video.mp4 by 50x"
Claude: "Successfully sped up video by 50x. Output: video_x50.mp4"
```

### Large Files (≥ 1GB)
Processed in background to prevent timeouts:
```
User: "Speed up large_video.mp4 by 50x"
Claude: "Large file detected (11.2GB). Started background processing.
         Job ID: large_video_1640995200000
         Estimated time: ~33 minutes
         Use 'check_processing_status' to monitor progress."

[Later...]
User: "Check processing status"
Claude: "Active jobs: 1
         • large_video_1640995200000: large_video.mp4 (11.2GB) - Running for 15 minutes"
```

## Technical Details

### Background Processing
- Large files (>1GB) automatically use background processing
- Prevents Claude Desktop timeouts
- Job tracking with unique IDs
- Automatic cleanup of completed jobs

### Command Structures
All FFmpeg commands are based on proven, tested structures:
- **Speed-up**: Uses PTS (Presentation Time Stamp) manipulation
- **Keyframes**: Uses libx264 with GOP control
- **Concatenation**: Uses FFmpeg's concat filter with file lists

### File Management
- All processing happens locally (no data sent to cloud)
- Automatic file existence validation
- Smart output filename generation
- Temporary file cleanup

## Privacy & Security

- **Local processing only**: All video data stays on your machine
- **No cloud uploads**: Only text responses sent to Claude/Anthropic
- **File system isolation**: Only accesses configured video directory
- **Process isolation**: Each job runs in separate process

## License

MIT
