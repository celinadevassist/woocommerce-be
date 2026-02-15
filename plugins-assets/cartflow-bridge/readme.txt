=== CartFlow Bridge ===
Contributors: cartflow
Tags: woocommerce, api, settings, rest-api, custom-fields, shipping, currency
Requires at least: 5.0
Tested up to: 6.4
Requires PHP: 7.4
Stable tag: 1.6.0
License: GPLv2 or later

REST API bridge for CartFlow to manage WordPress & WooCommerce settings, smart shipping, checkout currency conversion, and custom product fields.

== Description ==

CartFlow Bridge exposes REST API endpoints for WordPress and WooCommerce settings that don't have native API support. This allows CartFlow to remotely manage:

* Site Title, Tagline, Admin Email
* Timezone, Date/Time Format
* User Registration & Default Role
* WooCommerce Store Settings
* Custom States/Locations
* Smart Shipping (hide paid methods when free shipping qualifies)
* Checkout Currency Conversion
* Custom Product Fields (text, textarea, number, checkbox, radio, dropdown, image swatch, color picker, date picker, file upload)
* And much more!

== Installation ==

1. Upload the `cartflow-bridge` folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu
3. Go to CartFlow Bridge in the admin menu to see available endpoints

== Authentication ==

Use WooCommerce API credentials (consumer_key & consumer_secret) to authenticate.

== Changelog ==

= 1.6.0 =
* Added demo image support for custom fields — display an example image above the field input on product pages
* Added demo note support for custom fields — display an italic hint/description above the field input
* Added CSS styles for demo image and demo note rendering

= 1.5.0 =
* Custom product fields with 10 field types (text, textarea, number, checkbox, radio, dropdown, image swatch, color picker, date picker, file upload)
* Price add-ons per field and per option (flat fee or percentage)
* Conditional logic — show/hide fields based on other field values
* Order-level custom fields rendered at checkout
* Image swatch responsive layout (5 per row on small screens)
* Fieldset reordering support
* Field assignment by product, category, tag, product type, or attribute

= 1.4.0 =
* Checkout currency conversion with notice display
* Support for both classic and block checkout hooks
* Preserve original order total in meta

= 1.3.0 =
* Smart shipping — auto-hide paid shipping methods when free shipping is available
