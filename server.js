#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

class FFmpegMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'ffmpeg-video-editor',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'extract_video_segment',
          description: 'Extract a segment from a video file using start and end timestamps',
          inputSchema: {
            type: 'object',
            properties: {
              input_file: {
                type: 'string',
                description: 'Path to input video file'
              },
              output_file: {
                type: 'string',
                description: 'Path for output video file'
              },
              start_time: {
                type: 'string',
                description: 'Start timestamp (format: HH:MM:SS or MM:SS)'
              },
              end_time: {
                type: 'string',
                description: 'End timestamp (format: HH:MM:SS or MM:SS)'
              }
            },
            required: ['input_file', 'output_file', 'start_time', 'end_time']
          }
        },
        {
          name: 'concatenate_videos',
          description: 'Concatenate multiple video files into one',
          inputSchema: {
            type: 'object',
            properties: {
              input_files: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of input video file paths in order'
              },
              output_file: {
                type: 'string',
                description: 'Path for final concatenated video'
              }
            },
            required: ['input_files', 'output_file']
          }
        },
        {
          name: 'get_video_info',
          description: 'Get information about a video file (duration, resolution, etc.)',
          inputSchema: {
            type: 'object',
            properties: {
              input_file: {
                type: 'string',
                description: 'Path to video file'
              }
            },
            required: ['input_file']
          }
        },
        {
          name: 'create_highlights_reel',
          description: 'Create a highlights reel from multiple timestamp segments',
          inputSchema: {
            type: 'object',
            properties: {
              input_file: {
                type: 'string',
                description: 'Path to input video file'
              },
              segments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    start_time: { type: 'string', description: 'Start timestamp' },
                    end_time: { type: 'string', description: 'End timestamp' }
                  },
                  required: ['start_time', 'end_time']
                },
                description: 'Array of segments to extract'
              },
              output_file: {
                type: 'string',
                description: 'Path for output highlights video'
              }
            },
            required: ['input_file', 'segments', 'output_file']
          }
        },
        {
          name: 'change_video_speed',
          description: 'Change the playback speed of a video (1x to 50x+). Audio is removed for speeds > 1x',
          inputSchema: {
            type: 'object',
            properties: {
              input_file: {
                type: 'string',
                description: 'Path to input video file'
              },
              output_file: {
                type: 'string',
                description: 'Path for output video file'
              },
              speed: {
                type: 'number',
                description: 'Speed multiplier (e.g., 2.0 for 2x speed, 0.5 for half speed, 50 for 50x speed)',
                minimum: 0.1,
                maximum: 100
              }
            },
            required: ['input_file', 'output_file', 'speed']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'extract_video_segment':
            return await this.extractVideoSegment(args);
          case 'concatenate_videos':
            return await this.concatenateVideos(args);
          case 'get_video_info':
            return await this.getVideoInfo(args);
          case 'create_highlights_reel':
            return await this.createHighlightsReel(args);
          case 'change_video_speed':
            return await this.changeVideoSpeed(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ]
        };
      }
    });
  }

  async extractVideoSegment({ input_file, output_file, start_time, end_time }) {
    const command = `ffmpeg -i "${input_file}" -ss ${start_time} -to ${end_time} -c copy "${output_file}"`;
    
    try {
      const { stdout, stderr } = await execAsync(command);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully extracted segment from ${start_time} to ${end_time}\nOutput: ${output_file}\n\nFFmpeg output: ${stderr}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to extract video segment: ${error.message}`);
    }
  }

  async concatenateVideos({ input_files, output_file }) {
    // Create a temporary file list for FFmpeg concat
    const listFile = 'temp_concat_list.txt';
    const fileList = input_files.map(file => `file '${file}'`).join('\n');
    
    try {
      await fs.writeFile(listFile, fileList);
      
      const command = `ffmpeg -f concat -safe 0 -i "${listFile}" -c copy "${output_file}"`;
      const { stdout, stderr } = await execAsync(command);
      
      // Clean up temp file
      await fs.unlink(listFile);
      
      return {
        content: [
          {
            type: 'text',
            text: `Successfully concatenated ${input_files.length} videos\nOutput: ${output_file}\n\nFFmpeg output: ${stderr}`
          }
        ]
      };
    } catch (error) {
      // Clean up temp file in case of error
      try {
        await fs.unlink(listFile);
      } catch {}
      throw new Error(`Failed to concatenate videos: ${error.message}`);
    }
  }

  async getVideoInfo({ input_file }) {
    const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${input_file}"`;
    
    try {
      const { stdout } = await execAsync(command);
      const info = JSON.parse(stdout);
      
      const videoStream = info.streams.find(s => s.codec_type === 'video');
      const audioStream = info.streams.find(s => s.codec_type === 'audio');
      
      const duration = parseFloat(info.format.duration);
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      const seconds = Math.floor(duration % 60);
      
      const summary = {
        file: input_file,
        duration: `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} (${duration}s)`,
        size: `${Math.round(parseInt(info.format.size) / 1024 / 1024)} MB`,
        video: videoStream ? {
          codec: videoStream.codec_name,
          resolution: `${videoStream.width}x${videoStream.height}`,
          fps: eval(videoStream.r_frame_rate),
          bitrate: videoStream.bit_rate ? `${Math.round(parseInt(videoStream.bit_rate) / 1000)} kbps` : 'N/A'
        } : 'No video stream',
        audio: audioStream ? {
          codec: audioStream.codec_name,
          channels: audioStream.channels,
          sample_rate: `${audioStream.sample_rate} Hz`,
          bitrate: audioStream.bit_rate ? `${Math.round(parseInt(audioStream.bit_rate) / 1000)} kbps` : 'N/A'
        } : 'No audio stream'
      };
      
      return {
        content: [
          {
            type: 'text',
            text: `Video Information:\n${JSON.stringify(summary, null, 2)}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get video info: ${error.message}`);
    }
  }

  async createHighlightsReel({ input_file, segments, output_file }) {
    const tempFiles = [];
    
    try {
      // Extract each segment to temporary files
      for (let i = 0; i < segments.length; i++) {
        const tempFile = `temp_segment_${i}.mp4`;
        tempFiles.push(tempFile);
        
        await this.extractVideoSegment({
          input_file,
          output_file: tempFile,
          start_time: segments[i].start_time,
          end_time: segments[i].end_time
        });
      }
      
      // Concatenate all segments
      await this.concatenateVideos({
        input_files: tempFiles,
        output_file
      });
      
      // Clean up temporary files
      for (const tempFile of tempFiles) {
        await fs.unlink(tempFile);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `Successfully created highlights reel with ${segments.length} segments\nOutput: ${output_file}`
          }
        ]
      };
    } catch (error) {
      // Clean up temp files in case of error
      for (const tempFile of tempFiles) {
        try {
          await fs.unlink(tempFile);
        } catch {}
      }
      throw new Error(`Failed to create highlights reel: ${error.message}`);
    }
  }

  async changeVideoSpeed({ input_file, output_file, speed }) {
    // For speeds > 1x, remove audio using -an flag
    // For speeds <= 1x, keep audio but adjust it accordingly
    let command;
    
    if (speed > 1) {
      // Speed up video, remove audio
      command = `ffmpeg -i "${input_file}" -filter:v "setpts=PTS/${speed}" -an "${output_file}"`;
    } else {
      // Slow down video, keep audio and adjust it
      const audioPts = 1 / speed;
      command = `ffmpeg -i "${input_file}" -filter:v "setpts=PTS/${speed}" -filter:a "atempo=${speed}" "${output_file}"`;
    }
    
    try {
      const { stdout, stderr } = await execAsync(command);
      
      const speedDescription = speed > 1 
        ? `${speed}x faster (audio removed)` 
        : `${speed}x speed (audio preserved)`;
      
      return {
        content: [
          {
            type: 'text',
            text: `Successfully changed video speed to ${speedDescription}\nOutput: ${output_file}\n\nFFmpeg output: ${stderr}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to change video speed: ${error.message}`);
    }
  }
  }
}

// Start the server
const transport = new StdioServerTransport();
const server = new FFmpegMCPServer();
server.server.listen(transport);
