=== CartFlow Bridge ===
Contributors: cartflow
Tags: woocommerce, api, settings, rest-api
Requires at least: 5.0
Tested up to: 6.4
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later

REST API bridge for CartFlow to manage WordPress & WooCommerce settings.

== Description ==

CartFlow Bridge exposes REST API endpoints for WordPress and WooCommerce settings that don't have native API support. This allows CartFlow to remotely manage:

* Site Title, Tagline, Admin Email
* Timezone, Date/Time Format
* User Registration & Default Role
* WooCommerce Store Settings
* Custom States/Locations
* And much more!

== Installation ==

1. Upload the `cartflow-bridge` folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu
3. Go to CartFlow Bridge in the admin menu to see available endpoints

== Authentication ==

Use WooCommerce API credentials (consumer_key & consumer_secret) to authenticate.

== Changelog ==

= 1.0.0 =
* Initial release
