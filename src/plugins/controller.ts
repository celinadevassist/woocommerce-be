import { Controller, Get, Res, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';

@ApiTags('Plugins')
@Controller(':lang/plugins')
export class PluginsController {
  private readonly pluginsDir: string;

  constructor() {
    // Plugins are stored in the plugins-assets folder at the app root
    // In compiled code: __dirname = dist/plugins, go up 2 levels to reach app root
    this.pluginsDir = path.join(__dirname, '..', '..', 'plugins-assets');
  }

  @Get()
  @ApiOperation({ summary: 'Get list of available plugins for download' })
  @ApiResponse({ status: 200, description: 'List of available plugins' })
  async getAvailablePlugins() {
    const plugins = [
      {
        id: 'cartflow-bridge',
        name: 'CartFlow Bridge',
        version: '1.0.0',
        description:
          'REST API bridge for CartFlow to manage WordPress & WooCommerce settings that lack native API support',
        features: [
          'Manage Site Title, Tagline, Admin Email',
          'Configure Timezone, Date/Time Format',
          'Control User Registration & Default Roles',
          'Update WooCommerce Store Settings',
          'Add Custom States/Locations for Shipping',
          'Access System Info (PHP, MySQL, Plugins, Themes)',
        ],
        requirements: [
          'WordPress 5.0+',
          'WooCommerce 5.0+ (recommended)',
          'PHP 7.4+',
        ],
        downloadUrl: '/api/en/plugins/download/cartflow-bridge',
      },
    ];

    return plugins;
  }

  @Get('download/:pluginId')
  @ApiOperation({ summary: 'Download a plugin as ZIP file' })
  @ApiResponse({ status: 200, description: 'Plugin ZIP file' })
  @ApiResponse({ status: 404, description: 'Plugin not found' })
  async downloadPlugin(
    @Param('pluginId') pluginId: string,
    @Res() res: Response,
  ) {
    const allowedPlugins = ['cartflow-bridge', 'cartflow-locations'];

    if (!allowedPlugins.includes(pluginId)) {
      return res.status(404).json({ error: 'Plugin not found' });
    }

    // First check if a pre-built ZIP exists
    const zipPath = path.join(this.pluginsDir, `${pluginId}.zip`);
    if (fs.existsSync(zipPath)) {
      // Serve the pre-built ZIP file
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${pluginId}.zip"`,
      );

      const fileStream = fs.createReadStream(zipPath);
      fileStream.pipe(res);
      return;
    }

    // Fall back to generating ZIP on the fly
    const pluginPath = path.join(this.pluginsDir, pluginId);

    if (!fs.existsSync(pluginPath)) {
      return res.status(404).json({ error: 'Plugin files not found' });
    }

    // Set response headers for ZIP download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${pluginId}.zip"`,
    );

    // Create ZIP archive
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
      res.status(500).json({ error: 'Failed to create archive' });
    });

    // Pipe archive to response
    archive.pipe(res);

    // Add plugin directory to archive
    archive.directory(pluginPath, pluginId);

    // Finalize the archive
    await archive.finalize();
  }

  @Get(':pluginId/info')
  @ApiOperation({ summary: 'Get detailed plugin information' })
  @ApiResponse({ status: 200, description: 'Plugin information' })
  async getPluginInfo(@Param('pluginId') pluginId: string) {
    const plugins: Record<string, any> = {
      'cartflow-bridge': {
        id: 'cartflow-bridge',
        name: 'CartFlow Bridge',
        version: '1.0.0',
        description:
          'REST API bridge for CartFlow to manage WordPress & WooCommerce settings',
        author: 'CartFlow',
        license: 'GPL v2 or later',
        endpoints: [
          {
            category: 'General Settings',
            methods: ['GET', 'POST'],
            path: '/wp-json/cartflow/v1/settings/general',
            description:
              'Site title, tagline, admin email, timezone, date/time format',
          },
          {
            category: 'Reading Settings',
            methods: ['GET', 'POST'],
            path: '/wp-json/cartflow/v1/settings/reading',
            description: 'Homepage, posts per page, search engine visibility',
          },
          {
            category: 'Discussion Settings',
            methods: ['GET', 'POST'],
            path: '/wp-json/cartflow/v1/settings/discussion',
            description: 'Comments, pingbacks, moderation',
          },
          {
            category: 'Permalink Settings',
            methods: ['GET', 'POST'],
            path: '/wp-json/cartflow/v1/settings/permalinks',
            description: 'URL structure settings',
          },
          {
            category: 'WooCommerce Settings',
            methods: ['GET', 'POST'],
            path: '/wp-json/cartflow/v1/settings/woocommerce',
            description:
              'Store address, currency, tax, inventory, checkout, shipping',
          },
          {
            category: 'Custom Options',
            methods: ['GET', 'POST'],
            path: '/wp-json/cartflow/v1/options/{option_name}',
            description: 'Get or update any WordPress option',
          },
          {
            category: 'Custom Locations',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            path: '/wp-json/cartflow/v1/locations/states',
            description: 'Manage custom states for shipping zones',
          },
          {
            category: 'System Info',
            methods: ['GET'],
            path: '/wp-json/cartflow/v1/system/info',
            description: 'WordPress, PHP, MySQL, WooCommerce versions',
          },
        ],
        installation: [
          'Download the plugin ZIP file',
          'Go to WordPress Admin > Plugins > Add New > Upload Plugin',
          'Select the ZIP file and click "Install Now"',
          'Activate the plugin',
          'Go to CartFlow Bridge in the admin menu to see available endpoints',
        ],
        authentication:
          'Uses WooCommerce API credentials (consumer_key & consumer_secret)',
      },
    };

    if (!plugins[pluginId]) {
      return { error: 'Plugin not found' };
    }

    return plugins[pluginId];
  }
}
