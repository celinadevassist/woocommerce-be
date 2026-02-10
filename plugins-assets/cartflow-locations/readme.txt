=== CartFlow Custom Locations ===
Contributors: cartflow
Tags: woocommerce, shipping, locations, states, countries
Requires at least: 5.0
Tested up to: 6.4
Requires PHP: 7.4
Stable tag: 1.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Allows CartFlow to manage custom countries and states via REST API.

== Description ==

This plugin enables CartFlow (or any external application) to add, update, and delete
custom states/regions for WooCommerce shipping zones via a REST API.

**Features:**

* REST API endpoints for managing custom locations
* Hide/show states from WooCommerce checkout (built-in and custom)
* Automatic injection of custom states into WooCommerce
* Multiple authentication methods (WC API, Application Passwords, API Key)
* Admin interface for manual management
* Bulk state update support

== Installation ==

1. Upload the `cartflow-locations` folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Go to WooCommerce > CartFlow Locations to configure

== API Endpoints ==

All endpoints require authentication. Use one of:
- WooCommerce API keys (consumer_key & consumer_secret)
- WordPress Application Passwords (Basic Auth)
- Custom API Key (X-CartFlow-API-Key header)

**Get all custom states:**
`GET /wp-json/cartflow/v1/locations/states`

**Add a state:**
`POST /wp-json/cartflow/v1/locations/states`
```json
{
  "country_code": "EG",
  "state_code": "NEW_CAIRO",
  "state_name": "New Cairo"
}
```

**Update a state:**
`PUT /wp-json/cartflow/v1/locations/states/{country_code}/{state_code}`
```json
{
  "state_name": "New Cairo City"
}
```

**Delete a state:**
`DELETE /wp-json/cartflow/v1/locations/states/{country_code}/{state_code}`

**Bulk update states:**
`POST /wp-json/cartflow/v1/locations/states/{country_code}/bulk`
```json
{
  "states": [
    {"code": "CAIRO", "name": "Cairo"},
    {"code": "GIZA", "name": "Giza"},
    {"code": "ALEX", "name": "Alexandria"}
  ]
}
```

**Get all countries with states:**
`GET /wp-json/cartflow/v1/locations/countries`

**Hide/show a state from checkout:**
`PUT /wp-json/cartflow/v1/locations/states/{country_code}/{state_code}/visibility`
```json
{
  "visible": false
}
```

**Get hidden states:**
`GET /wp-json/cartflow/v1/locations/hidden-states`

== Changelog ==

= 1.1.0 =
* Added state visibility toggle — hide/show any state (built-in or custom) from WooCommerce checkout
* New REST endpoint: PUT /locations/states/{country}/{state}/visibility
* New REST endpoint: GET /locations/hidden-states
* Hidden states are filtered from woocommerce_states hook

= 1.0.0 =
* Initial release
