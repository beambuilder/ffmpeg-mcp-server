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

  setupToolHandlers() {    this.server.setRequestHandler(ListToolsRequestSchema, async () => {      return {
        tools: [
          {
            name: 'speed_up_video',
            description: 'Speed up a video by a given factor (e.g., 50 = 50x faster). Removes audio and outputs high-quality MP4.',
            inputSchema: {
              type: 'object',
              properties: {
                filename: {
                  type: 'string',
                  description: 'Name of the video file (e.g., "GX010412.MP4"). The file will be searched in the configured folder.'
                },
                speed_factor: {
                  type: 'number',
                  minimum: 1,
                  maximum: 1000,
                  description: 'Speed multiplier (e.g., 50 = 50x faster)'
                },
                output_suffix: {
                  type: 'string',
                  description: 'Optional suffix for output filename (defaults to "x{speed_factor}")',
                  default: ''
                }
              },
              required: ['filename', 'speed_factor']
            }
          },
          {
            name: 'get_files_info',
            description: 'Get a list of all files in the configured video folder with their names and modification dates.',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          }
        ]
      };
    });    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;      try {
        switch (name) {
          case "speed_up_video":
            return await this.speedUpVideo(args);
          case "get_files_info":
            return await this.getFilesInfo(args);
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
  }  async speedUpVideo(args) {
    const { filename, speed_factor, output_suffix } = args;
    
    // Read the video folder path from environment variable set in Claude config
    const baseFolder = process.env.VIDEOS_PATH || process.env.VIDEO_FOLDER || '.';
    
    console.error(`Base folder: ${baseFolder}`);
    console.error(`Looking for file: ${filename}`);
    
    const inputPath = path.join(baseFolder, filename);
    console.error(`Full input path: ${inputPath}`);
    
    // Create output filename with suffix
    const fileExt = path.extname(filename);
    const baseName = path.basename(filename, fileExt);
    const suffix = output_suffix || `x${speed_factor}`;
    const outputFilename = `${baseName}${suffix}${fileExt}`;
    const outputPath = path.join(baseFolder, outputFilename);
    
    // Check if input file exists
    try {
      await fs.access(inputPath);
    } catch (error) {
      throw new Error(`Input file not found: ${inputPath}`);
    }
    
    // Calculate PTS value (inverse of speed factor)
    const ptsValue = (1 / speed_factor).toFixed(4);
    
    // Build the exact command structure you provided
    const command = `ffmpeg -i "${inputPath}" -filter:v "setpts=${ptsValue}*PTS" -r 30 -an -c:v mpeg4 -q:v 5 "${outputPath}"`;
    
    try {
      console.error(`Executing: ${command}`);
      const { stdout, stderr } = await execAsync(command);
      
      return {
        content: [
          {
            type: "text",
            text: `Successfully sped up video by ${speed_factor}x.\nInput: ${inputPath}\nOutput: ${outputPath}\nPTS value used: ${ptsValue}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`FFmpeg speed-up failed: ${error.message}\nCommand: ${command}`);
    }
  }

  async getFilesInfo(args) {
    // Read the video folder path from environment variable set in Claude config
    const baseFolder = process.env.VIDEOS_PATH || process.env.VIDEO_FOLDER || '.';
    
    console.error(`Getting files info from folder: ${baseFolder}`);
    
    try {
      // Check if folder exists
      await fs.access(baseFolder);
      
      // Read directory contents
      const files = await fs.readdir(baseFolder);
      
      const filesInfo = [];
      
      for (const filename of files) {
        const filePath = path.join(baseFolder, filename);
        
        try {
          const stats = await fs.stat(filePath);
          
          // Only include files (not directories)
          if (stats.isFile()) {
            filesInfo.push({
              name: filename,
              size: stats.size,
              modified: stats.mtime.toISOString(),
              sizeReadable: this.formatFileSize(stats.size)
            });
          }
        } catch (statError) {
          // Skip files that can't be accessed
          console.error(`Could not get stats for file: ${filename}`);
        }
      }
      
      // Sort by modification date (newest first)
      filesInfo.sort((a, b) => new Date(b.modified) - new Date(a.modified));
      
      const filesList = filesInfo.map(file => 
        `${file.name} (${file.sizeReadable}, modified: ${new Date(file.modified).toLocaleString()})`
      ).join('\n');
      
      return {
        content: [
          {
            type: "text",
            text: `Files in ${baseFolder}:\n\nTotal files: ${filesInfo.length}\n\n${filesList || 'No files found.'}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to read directory: ${error.message}`);
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("FFmpeg MCP server running on stdio");
  }
}

const server = new FFmpegMCPServer();
server.run().catch(console.error);
