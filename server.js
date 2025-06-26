#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
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
        name: 'ffmpeg-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
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
          description: 'Change the playback speed of a video (1.0 = normal, 2.0 = 2x faster, 0.5 = half speed)',
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
                minimum: 0.1,
                maximum: 100,
                description: 'Speed multiplier (e.g., 2.0 = 2x speed, 0.5 = half speed, 50 = 50x speed)'
              }
            },
            required: ['input_file', 'output_file', 'speed']
          }
        }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "extract_video_segment":
            return await this.extractVideoSegment(args);
          case "concatenate_videos":
            return await this.concatenateVideos(args);
          case "get_video_info":
            return await this.getVideoInfo(args);
          case "create_highlights_reel":
            return await this.createHighlightsReel(args);
          case "change_video_speed":
            return await this.changeVideoSpeed(args);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error.message}`
        );
      }
    });
  }

  async extractVideoSegment(args) {
    const { input_file, output_file, start_time, end_time } = args;
    
    const command = `ffmpeg -i "${input_file}" -ss ${start_time} -to ${end_time} -c copy "${output_file}"`;
    
    try {
      const { stdout, stderr } = await execAsync(command);
      return {
        content: [
          {
            type: "text",
            text: `Successfully extracted video segment from ${start_time} to ${end_time}. Output saved to: ${output_file}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`FFmpeg extraction failed: ${error.message}`);
    }
  }

  async concatenateVideos(args) {
    const { input_files, output_file } = args;
    
    // Create a temporary file list for FFmpeg
    const listFile = 'temp_concat_list.txt';
    const fileList = input_files.map(file => `file '${file}'`).join('\n');
    
    try {
      await fs.writeFile(listFile, fileList);
      
      const command = `ffmpeg -f concat -safe 0 -i "${listFile}" -c copy "${output_file}"`;
      const { stdout, stderr } = await execAsync(command);
      
      // Clean up temporary file
      await fs.unlink(listFile);
      
      return {
        content: [
          {
            type: "text",
            text: `Successfully concatenated ${input_files.length} videos. Output saved to: ${output_file}`
          }
        ]
      };
    } catch (error) {
      // Clean up temporary file on error
      try {
        await fs.unlink(listFile);
      } catch (unlinkError) {
        // Ignore unlink errors
      }
      throw new Error(`FFmpeg concatenation failed: ${error.message}`);
    }
  }

  async getVideoInfo(args) {
    const { input_file } = args;
    
    const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${input_file}"`;
    
    try {
      const { stdout, stderr } = await execAsync(command);
      const info = JSON.parse(stdout);
      
      // Extract useful information
      const videoStream = info.streams.find(stream => stream.codec_type === 'video');
      const audioStream = info.streams.find(stream => stream.codec_type === 'audio');
      
      const result = {
        duration: parseFloat(info.format.duration),
        file_size: parseInt(info.format.size),
        format: info.format.format_name,
        video: videoStream ? {
          codec: videoStream.codec_name,
          width: videoStream.width,
          height: videoStream.height,
          fps: eval(videoStream.r_frame_rate) // Convert fraction to decimal
        } : null,
        audio: audioStream ? {
          codec: audioStream.codec_name,
          sample_rate: audioStream.sample_rate,
          channels: audioStream.channels
        } : null
      };
      
      return {
        content: [
          {
            type: "text",
            text: `Video Information:\n${JSON.stringify(result, null, 2)}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`FFprobe failed: ${error.message}`);
    }
  }

  async createHighlightsReel(args) {
    const { input_file, output_file, segments } = args;
    
    // Extract each segment first
    const tempFiles = [];
    
    try {
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const tempFile = `temp_segment_${i}.mp4`;
        tempFiles.push(tempFile);
        
        await this.extractVideoSegment({
          input_file,
          output_file: tempFile,
          start_time: segment.start_time,
          end_time: segment.end_time
        });
      }
      
      // Concatenate all segments
      await this.concatenateVideos({
        input_files: tempFiles,
        output_file
      });
      
      // Clean up temporary files
      for (const tempFile of tempFiles) {
        try {
          await fs.unlink(tempFile);
        } catch (unlinkError) {
          // Ignore unlink errors
        }
      }
      
      return {
        content: [
          {
            type: "text",
            text: `Successfully created highlights reel with ${segments.length} segments. Output saved to: ${output_file}`
          }
        ]
      };
    } catch (error) {
      // Clean up temporary files on error
      for (const tempFile of tempFiles) {
        try {
          await fs.unlink(tempFile);
        } catch (unlinkError) {
          // Ignore unlink errors
        }
      }
      throw new Error(`Highlights reel creation failed: ${error.message}`);
    }
  }

  async changeVideoSpeed(args) {
    const { input_file, output_file, speed } = args;
    
    // Calculate the PTS value for FFmpeg (inverse of speed)
    const ptsValue = 1 / speed;
    
    let command;
    if (speed > 1) {
      // Speed up: remove audio with -an flag
      command = `ffmpeg -i "${input_file}" -filter:v "setpts=${ptsValue}*PTS" -an "${output_file}"`;
    } else {
      // Slow down or normal speed: preserve and adjust audio
      const audioSpeed = speed;
      command = `ffmpeg -i "${input_file}" -filter:v "setpts=${ptsValue}*PTS" -filter:a "atempo=${audioSpeed}" "${output_file}"`;
    }
    
    try {
      const { stdout, stderr } = await execAsync(command);
      
      const speedDescription = speed > 1 
        ? `${speed}x speed (audio removed)` 
        : `${speed}x speed (audio preserved)`;
        
      return {
        content: [
          {
            type: "text",
            text: `Successfully changed video speed to ${speedDescription}. Output saved to: ${output_file}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`FFmpeg speed change failed: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("FFmpeg MCP server running on stdio");
  }
}

const server = new FFmpegMCPServer();
server.run().catch(console.error);
