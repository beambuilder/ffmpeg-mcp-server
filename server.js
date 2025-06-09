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
        }
      ]
    }));
    // ...existing code for tool handlers...
  }
}

// Start the server
const transport = new StdioServerTransport();
const server = new FFmpegMCPServer();
server.server.listen(transport);
