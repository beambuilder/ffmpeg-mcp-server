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

    // Track background processing operations
    this.processingQueue = new Map();
    this.setupToolHandlers();
  }

  setupToolHandlers() {    this.server.setRequestHandler(ListToolsRequestSchema, async () => {      return {        tools: [
          {
            name: 'speed_up_video',
            description: 'Speed up a video by a given factor (e.g., 50 = 50x faster). For large files, processing starts in background.',
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
            name: 'check_processing_status',
            description: 'Check the status of background video processing operations.',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
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
          },
          {
            name: 'concatenate_videos',
            description: 'Concatenate multiple video files into one output video. Creates temporary text file, processes videos, and cleans up automatically.',
            inputSchema: {
              type: 'object',
              properties: {
                video_files: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of video filenames to concatenate in order (e.g., ["GX010410x50.MP4", "GX010419x50.MP4"])'
                },
                output_filename: {
                  type: 'string',
                  description: 'Name for the output concatenated video file (e.g., "concatenated_output.mp4")'
                }
              },
              required: ['video_files', 'output_filename']
            }
          }
        ]
      };
    });    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;      try {        switch (name) {
          case "speed_up_video":
            return await this.speedUpVideo(args);
          case "check_processing_status":
            return await this.checkProcessingStatus(args);
          case "get_files_info":
            return await this.getFilesInfo(args);
          case "concatenate_videos":
            return await this.concatenateVideos(args);
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
    
    // Check if input file exists and get file size
    let fileStats;
    try {
      fileStats = await fs.stat(inputPath);
    } catch (error) {
      throw new Error(`Input file not found: ${inputPath}`);
    }
    
    const fileSizeGB = fileStats.size / (1024 * 1024 * 1024);
    const isLargeFile = fileSizeGB > 1; // Consider files > 1GB as large
    
    // Calculate PTS value (inverse of speed factor)
    const ptsValue = (1 / speed_factor).toFixed(4);
    
    // Build the exact command structure you provided
    const command = `ffmpeg -i "${inputPath}" -filter:v "setpts=${ptsValue}*PTS" -r 30 -an -c:v mpeg4 -q:v 5 "${outputPath}"`;
    
    if (isLargeFile) {
      // For large files, start background processing
      const jobId = `${baseName}_${Date.now()}`;
      
      console.error(`Large file detected (${fileSizeGB.toFixed(2)}GB). Starting background processing with job ID: ${jobId}`);
      
      // Store job info
      this.processingQueue.set(jobId, {
        status: 'processing',
        inputFile: filename,
        outputFile: outputFilename,
        startTime: new Date(),
        command: command,
        fileSize: fileSizeGB
      });
      
      // Start background process
      this.startBackgroundProcessing(jobId, command, inputPath, outputPath);
      
      return {
        content: [
          {
            type: "text",
            text: `Large file detected (${fileSizeGB.toFixed(2)}GB). Started background processing.\nJob ID: ${jobId}\nInput: ${inputPath}\nOutput: ${outputPath}\nEstimated time: ${this.estimateProcessingTime(fileSizeGB, speed_factor)}\n\nUse 'check_processing_status' to monitor progress.`
          }
        ]
      };
    } else {
      // For smaller files, process normally (synchronously)
      try {
        console.error(`Processing small file (${fileSizeGB.toFixed(2)}GB) synchronously`);
        console.error(`Executing: ${command}`);
        const { stdout, stderr } = await execAsync(command);
        
        return {
          content: [
            {
              type: "text",
              text: `Successfully sped up video by ${speed_factor}x.\nInput: ${inputPath}\nOutput: ${outputPath}\nFile size: ${fileSizeGB.toFixed(2)}GB\nPTS value used: ${ptsValue}`
            }
          ]
        };
      } catch (error) {
        throw new Error(`FFmpeg speed-up failed: ${error.message}\nCommand: ${command}`);
      }
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

  async concatenateVideos(args) {
    const { video_files, output_filename } = args;
    
    // Read the video folder path from environment variable set in Claude config
    const baseFolder = process.env.VIDEOS_PATH || process.env.VIDEO_FOLDER || '.';
    
    console.error(`Concatenating videos in folder: ${baseFolder}`);
    console.error(`Input videos: ${video_files.join(', ')}`);
    console.error(`Output filename: ${output_filename}`);
      // Generate temporary filename for the concat list
    const tempListFile = `concat_list.txt`;
    const tempListPath = path.join(baseFolder, tempListFile);
    const outputPath = path.join(baseFolder, output_filename);
    
    try {
      // Verify all input files exist
      for (const filename of video_files) {
        const inputPath = path.join(baseFolder, filename);
        try {
          await fs.access(inputPath);
        } catch (error) {
          throw new Error(`Input video file not found: ${inputPath}`);
        }
      }
      
      // Create the concat list file content
      const listContent = video_files.map(filename => `file '${filename}'`).join('\n');
      
      console.error(`Creating temporary list file: ${tempListPath}`);
      console.error(`List content:\n${listContent}`);
      
      // Write the temporary list file
      await fs.writeFile(tempListPath, listContent, 'utf8');
        // Build the FFmpeg command using your exact structure
      const command = `ffmpeg -f concat -safe 0 -i ${tempListFile} -c copy ${output_filename}`;
      
      console.error(`Executing: ${command}`);
      console.error(`Working directory: ${baseFolder}`);
      
      // Execute FFmpeg command in the video folder directory
      const { stdout, stderr } = await execAsync(command, { cwd: baseFolder });
      
      // Clean up the temporary list file
      console.error(`Cleaning up temporary file: ${tempListPath}`);
      await fs.unlink(tempListPath);
      
      return {
        content: [
          {
            type: "text",
            text: `Successfully concatenated ${video_files.length} videos.\nInput videos: ${video_files.join(', ')}\nOutput: ${outputPath}\nTemporary list file cleaned up.`
          }
        ]
      };
    } catch (error) {
      // Clean up temporary file on error (if it exists)
      try {
        await fs.unlink(tempListPath);
        console.error(`Cleaned up temporary file after error: ${tempListPath}`);
      } catch (unlinkError) {
        // Ignore cleanup errors
        console.error(`Could not clean up temporary file: ${tempListPath}`);
      }
      
      throw new Error(`FFmpeg concatenation failed: ${error.message}\nCommand: ffmpeg -f concat -safe 0 -i "${tempListFile}" -c copy "${output_filename}"`);
    }
  }

  startBackgroundProcessing(jobId, command, inputPath, outputPath) {
    console.error(`Starting background job ${jobId}: ${command}`);
    
    const child = exec(command, (error, stdout, stderr) => {
      const job = this.processingQueue.get(jobId);
      if (!job) return;
      
      if (error) {
        console.error(`Background job ${jobId} failed: ${error.message}`);
        job.status = 'failed';
        job.error = error.message;
        job.endTime = new Date();
      } else {
        console.error(`Background job ${jobId} completed successfully`);
        job.status = 'completed';
        job.endTime = new Date();
      }
    });
    
    // Store the child process reference
    const job = this.processingQueue.get(jobId);
    if (job) {
      job.process = child;
    }
  }

  async checkProcessingStatus(args) {
    const jobs = Array.from(this.processingQueue.entries()).map(([jobId, job]) => {
      const duration = job.endTime 
        ? (job.endTime - job.startTime) / 1000 
        : (new Date() - job.startTime) / 1000;
      
      return {
        jobId,
        status: job.status,
        inputFile: job.inputFile,
        outputFile: job.outputFile,
        fileSize: `${job.fileSize.toFixed(2)}GB`,
        duration: `${Math.floor(duration)}s`,
        startTime: job.startTime.toLocaleString(),
        endTime: job.endTime ? job.endTime.toLocaleString() : null,
        error: job.error || null
      };
    });
    
    // Clean up completed/failed jobs older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [jobId, job] of this.processingQueue.entries()) {
      if ((job.status === 'completed' || job.status === 'failed') && 
          job.endTime && job.endTime < oneHourAgo) {
        this.processingQueue.delete(jobId);
      }
    }
    
    const activeJobs = jobs.filter(job => job.status === 'processing');
    const completedJobs = jobs.filter(job => job.status === 'completed');
    const failedJobs = jobs.filter(job => job.status === 'failed');
    
    let statusText = `Processing Status Summary:\n\n`;
    statusText += `Active jobs: ${activeJobs.length}\n`;
    statusText += `Completed jobs: ${completedJobs.length}\n`;
    statusText += `Failed jobs: ${failedJobs.length}\n\n`;
    
    if (activeJobs.length > 0) {
      statusText += `ACTIVE JOBS:\n`;
      activeJobs.forEach(job => {
        statusText += `• ${job.jobId}: ${job.inputFile} (${job.fileSize}) - Running for ${job.duration}\n`;
      });
      statusText += `\n`;
    }
    
    if (completedJobs.length > 0) {
      statusText += `RECENTLY COMPLETED:\n`;
      completedJobs.slice(-3).forEach(job => {
        statusText += `• ${job.outputFile} - Completed in ${job.duration} (${job.endTime})\n`;
      });
      statusText += `\n`;
    }
    
    if (failedJobs.length > 0) {
      statusText += `FAILED JOBS:\n`;
      failedJobs.slice(-3).forEach(job => {
        statusText += `• ${job.inputFile} - Failed after ${job.duration}: ${job.error}\n`;
      });
    }
    
    if (jobs.length === 0) {
      statusText += `No recent processing jobs found.`;
    }
    
    return {
      content: [
        {
          type: "text",
          text: statusText
        }
      ]
    };
  }

  estimateProcessingTime(fileSizeGB, speedFactor) {
    // Rough estimation: ~2-5 minutes per GB for speed-up operations
    const baseMinutesPerGB = 3;
    const estimatedMinutes = fileSizeGB * baseMinutesPerGB;
    
    if (estimatedMinutes < 60) {
      return `~${Math.ceil(estimatedMinutes)} minutes`;
    } else {
      const hours = Math.floor(estimatedMinutes / 60);
      const minutes = Math.ceil(estimatedMinutes % 60);
      return `~${hours}h ${minutes}m`;
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
