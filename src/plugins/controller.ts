import { Controller, Get, Res, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';

@ApiTags('Plugins')
@Controller(':lang/plugins')
export class PluginsController {
  private readonly logger = new Logger(PluginsController.name);
  private readonly pluginsDir: string;

  constructor() {
    // Try multiple possible paths for plugins-assets directory
    // This handles different environments (dev, compiled, Docker, etc.)
    const possiblePaths = [
      path.join(process.cwd(), 'plugins-assets'), // From current working directory
      path.join(__dirname, '..', '..', 'plugins-assets'), // From dist/plugins (compiled)
      path.join(__dirname, '..', 'plugins-assets'), // From dist (if flat structure)
      path.join(__dirname, '..', '..', '..', 'plugins-assets'), // Alternative compiled structure
    ];

    this.pluginsDir =
      possiblePaths.find((p) => fs.existsSync(p)) || possiblePaths[0];
    this.logger.log(`Plugins directory resolved to: ${this.pluginsDir}`);
  }

  // Latest plugin versions - update these when releasing new versions
  private readonly latestVersions = {
    'cartflow-bridge': '1.3.0',
  };

  @Get()
  @ApiOperation({ summary: 'Get list of available plugins for download' })
  @ApiResponse({ status: 200, description: 'List of available plugins' })
  async getAvailablePlugins() {
    const plugins = [
      {
        id: 'cartflow-bridge',
        name: 'CartFlow Bridge',
        version: this.latestVersions['cartflow-bridge'],
        description:
          'REST API bridge for CartFlow to manage WordPress & WooCommerce settings, smart shipping, and checkout currency conversion',
        features: [
          'Checkout Currency Conversion: Convert order totals to payment gateway currency',
          'Smart Shipping: Auto-hide paid shipping when free shipping qualifies',
          'Manage Site Title, Tagline, Admin Email',
          'Configure Timezone, Date/Time Format',
          'Control User Registration & Default Roles',
          'Update WooCommerce Store Settings',
          'Add Custom States/Locations for Shipping',
          'State Visibility: Hide/show states from WooCommerce checkout',
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
    const allowedPlugins = ['cartflow-bridge'];

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
        version: this.latestVersions['cartflow-bridge'],
        description:
          'REST API bridge for CartFlow to manage WordPress & WooCommerce settings, smart shipping, and checkout currency conversion',
        author: 'CartFlow',
        license: 'GPL v2 or later',
        changelog: [
          {
            version: '1.3.0',
            changes: [
              'Added state visibility toggle: hide/show any state (built-in or custom) from WooCommerce checkout',
              'New REST endpoint: PUT /locations/states/{country}/{state}/visibility',
              'New REST endpoint: GET /locations/hidden-states',
              'Hidden states are filtered from the woocommerce_states hook',
            ],
          },
          {
            version: '1.2.0',
            changes: [
              'Added Checkout Currency Conversion: auto-fetch exchange rates, configurable margin, convert order totals at checkout',
              'Added currency conversion REST endpoints (GET/POST features/currency, GET features/currency/live-rate)',
              'Stores original currency and total in order meta for auditing',
            ],
          },
          {
            version: '1.1.0',
            changes: [
              'Added Smart Shipping: Automatically hides paid shipping methods when free shipping is available',
              'Added plugin info endpoint for version checking',
              'Added shipping features settings endpoint',
            ],
          },
          {
            version: '1.0.0',
            changes: ['Initial release'],
          },
        ],
        endpoints: [
          {
            category: 'Plugin Info',
            methods: ['GET'],
            path: '/wp-json/cartflow/v1/plugin/info',
            description: 'Get plugin version and feature status',
          },
          {
            category: 'Smart Features',
            methods: ['GET', 'POST'],
            path: '/wp-json/cartflow/v1/features/shipping',
            description:
              'Configure smart shipping (hide paid methods when free shipping qualifies)',
          },
          {
            category: 'Currency Conversion',
            methods: ['GET', 'POST'],
            path: '/wp-json/cartflow/v1/features/currency',
            description:
              'Configure checkout currency conversion (gateway currency, margin, rate override)',
          },
          {
            category: 'Currency Conversion',
            methods: ['GET'],
            path: '/wp-json/cartflow/v1/features/currency/live-rate',
            description:
              'Get live exchange rate between base and target currencies',
          },
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
            category: 'State Visibility',
            methods: ['PUT'],
            path: '/wp-json/cartflow/v1/locations/states/{country}/{state}/visibility',
            description:
              'Hide/show a state from WooCommerce checkout (works for built-in and custom states)',
          },
          {
            category: 'State Visibility',
            methods: ['GET'],
            path: '/wp-json/cartflow/v1/locations/hidden-states',
            description: 'Get all hidden states',
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
          'Go to CartFlow Bridge in the admin menu to see available endpoints and configure features',
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

  @Get(':pluginId/latest-version')
  @ApiOperation({ summary: 'Get the latest version of a plugin' })
  @ApiResponse({ status: 200, description: 'Latest plugin version' })
  async getLatestVersion(@Param('pluginId') pluginId: string) {
    const version = this.latestVersions[pluginId];
    if (!version) {
      return { error: 'Plugin not found' };
    }
    return { pluginId, version };
  }
}
