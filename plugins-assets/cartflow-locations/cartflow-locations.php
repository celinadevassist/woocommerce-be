<?php
/**
 * Plugin Name: CartFlow Custom Locations
 * Plugin URI: https://cartflow.app
 * Description: Allows CartFlow to manage custom countries and states via REST API
 * Version: 1.1.0
 * Author: CartFlow
 * Author URI: https://cartflow.app
 * License: GPL v2 or later
 * Text Domain: cartflow-locations
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

class CartFlow_Custom_Locations {

    private static $instance = null;
    private $option_name = 'cartflow_custom_states';
    private $hidden_option_name = 'cartflow_hidden_states';

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        // Register REST API endpoints
        add_action('rest_api_init', array($this, 'register_rest_routes'));

        // Inject custom states into WooCommerce
        add_filter('woocommerce_states', array($this, 'add_custom_states'), 10, 1);

        // Admin menu for manual management (optional)
        add_action('admin_menu', array($this, 'add_admin_menu'));
    }

    /**
     * Register REST API routes
     */
    public function register_rest_routes() {
        $namespace = 'cartflow/v1';

        // Get all custom states
        register_rest_route($namespace, '/locations/states', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_custom_states'),
            'permission_callback' => array($this, 'check_api_permission'),
        ));

        // Add a new custom state
        register_rest_route($namespace, '/locations/states', array(
            'methods' => 'POST',
            'callback' => array($this, 'add_custom_state'),
            'permission_callback' => array($this, 'check_api_permission'),
            'args' => array(
                'country_code' => array(
                    'required' => true,
                    'type' => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                ),
                'state_code' => array(
                    'required' => true,
                    'type' => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                ),
                'state_name' => array(
                    'required' => true,
                    'type' => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                ),
            ),
        ));

        // Update a custom state
        register_rest_route($namespace, '/locations/states/(?P<country_code>[A-Z]{2})/(?P<state_code>[A-Za-z0-9_-]+)', array(
            'methods' => 'PUT',
            'callback' => array($this, 'update_custom_state'),
            'permission_callback' => array($this, 'check_api_permission'),
            'args' => array(
                'state_name' => array(
                    'required' => true,
                    'type' => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                ),
            ),
        ));

        // Delete a custom state
        register_rest_route($namespace, '/locations/states/(?P<country_code>[A-Z]{2})/(?P<state_code>[A-Za-z0-9_-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'delete_custom_state'),
            'permission_callback' => array($this, 'check_api_permission'),
        ));

        // Bulk update states for a country
        register_rest_route($namespace, '/locations/states/(?P<country_code>[A-Z]{2})/bulk', array(
            'methods' => 'POST',
            'callback' => array($this, 'bulk_update_states'),
            'permission_callback' => array($this, 'check_api_permission'),
            'args' => array(
                'states' => array(
                    'required' => true,
                    'type' => 'array',
                ),
            ),
        ));

        // Set state visibility (hide/show in checkout)
        register_rest_route($namespace, '/locations/states/(?P<country_code>[A-Z]{2})/(?P<state_code>[A-Za-z0-9_-]+)/visibility', array(
            'methods' => 'PUT',
            'callback' => array($this, 'set_state_visibility'),
            'permission_callback' => array($this, 'check_api_permission'),
            'args' => array(
                'visible' => array(
                    'required' => true,
                    'type' => 'boolean',
                ),
            ),
        ));

        // Get hidden states
        register_rest_route($namespace, '/locations/hidden-states', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_hidden_states'),
            'permission_callback' => array($this, 'check_api_permission'),
        ));

        // Get all countries (WooCommerce + custom)
        register_rest_route($namespace, '/locations/countries', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_countries'),
            'permission_callback' => array($this, 'check_api_permission'),
        ));
    }

    /**
     * Check API permission using WooCommerce consumer key/secret or application password
     */
    public function check_api_permission($request) {
        // Option 1: Check WooCommerce API authentication
        if (function_exists('wc_api_request_authentication')) {
            $user = wc_api_request_authentication(null);
            if ($user && !is_wp_error($user)) {
                return true;
            }
        }

        // Option 2: Check for Authorization header (Basic Auth with WP Application Password)
        $auth_header = $request->get_header('Authorization');
        if ($auth_header) {
            if (strpos($auth_header, 'Basic ') === 0) {
                $credentials = base64_decode(substr($auth_header, 6));
                list($username, $password) = explode(':', $credentials, 2);

                $user = wp_authenticate_application_password(null, $username, $password);
                if ($user && !is_wp_error($user)) {
                    return true;
                }
            }
        }

        // Option 3: Check for custom API key in header
        $api_key = $request->get_header('X-CartFlow-API-Key');
        $stored_key = get_option('cartflow_api_key');
        if ($api_key && $stored_key && hash_equals($stored_key, $api_key)) {
            return true;
        }

        // Option 4: Check WooCommerce consumer key in query params
        $consumer_key = $request->get_param('consumer_key');
        $consumer_secret = $request->get_param('consumer_secret');
        if ($consumer_key && $consumer_secret) {
            global $wpdb;
            $key = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT * FROM {$wpdb->prefix}woocommerce_api_keys WHERE consumer_key = %s",
                    wc_api_hash($consumer_key)
                )
            );
            if ($key && hash_equals($key->consumer_secret, $consumer_secret)) {
                return true;
            }
        }

        return new WP_Error(
            'rest_forbidden',
            __('Authentication required.', 'cartflow-locations'),
            array('status' => 401)
        );
    }

    /**
     * Get all custom states
     */
    public function get_custom_states($request) {
        $states = get_option($this->option_name, array());
        return rest_ensure_response($states);
    }

    /**
     * Add a new custom state
     */
    public function add_custom_state($request) {
        $country_code = strtoupper($request->get_param('country_code'));
        $state_code = $request->get_param('state_code');
        $state_name = $request->get_param('state_name');

        $states = get_option($this->option_name, array());

        if (!isset($states[$country_code])) {
            $states[$country_code] = array();
        }

        // Check if state already exists
        if (isset($states[$country_code][$state_code])) {
            return new WP_Error(
                'state_exists',
                __('State already exists. Use PUT to update.', 'cartflow-locations'),
                array('status' => 409)
            );
        }

        $states[$country_code][$state_code] = $state_name;
        update_option($this->option_name, $states);

        // Clear WooCommerce transients
        $this->clear_wc_cache();

        return rest_ensure_response(array(
            'success' => true,
            'message' => sprintf(__('State %s added to %s', 'cartflow-locations'), $state_name, $country_code),
            'state' => array(
                'country_code' => $country_code,
                'state_code' => $state_code,
                'state_name' => $state_name,
            ),
        ));
    }

    /**
     * Update a custom state
     */
    public function update_custom_state($request) {
        $country_code = strtoupper($request->get_param('country_code'));
        $state_code = $request->get_param('state_code');
        $state_name = $request->get_param('state_name');

        $states = get_option($this->option_name, array());

        if (!isset($states[$country_code]) || !isset($states[$country_code][$state_code])) {
            return new WP_Error(
                'state_not_found',
                __('State not found.', 'cartflow-locations'),
                array('status' => 404)
            );
        }

        $states[$country_code][$state_code] = $state_name;
        update_option($this->option_name, $states);

        $this->clear_wc_cache();

        return rest_ensure_response(array(
            'success' => true,
            'message' => sprintf(__('State %s updated', 'cartflow-locations'), $state_name),
            'state' => array(
                'country_code' => $country_code,
                'state_code' => $state_code,
                'state_name' => $state_name,
            ),
        ));
    }

    /**
     * Delete a custom state
     */
    public function delete_custom_state($request) {
        $country_code = strtoupper($request->get_param('country_code'));
        $state_code = $request->get_param('state_code');

        $states = get_option($this->option_name, array());

        if (!isset($states[$country_code]) || !isset($states[$country_code][$state_code])) {
            return new WP_Error(
                'state_not_found',
                __('State not found.', 'cartflow-locations'),
                array('status' => 404)
            );
        }

        unset($states[$country_code][$state_code]);

        // Remove country if no states left
        if (empty($states[$country_code])) {
            unset($states[$country_code]);
        }

        update_option($this->option_name, $states);

        $this->clear_wc_cache();

        return rest_ensure_response(array(
            'success' => true,
            'message' => __('State deleted', 'cartflow-locations'),
        ));
    }

    /**
     * Bulk update states for a country
     */
    public function bulk_update_states($request) {
        $country_code = strtoupper($request->get_param('country_code'));
        $new_states = $request->get_param('states');

        $states = get_option($this->option_name, array());
        $states[$country_code] = array();

        foreach ($new_states as $state) {
            if (isset($state['code']) && isset($state['name'])) {
                $states[$country_code][$state['code']] = $state['name'];
            }
        }

        update_option($this->option_name, $states);

        $this->clear_wc_cache();

        return rest_ensure_response(array(
            'success' => true,
            'message' => sprintf(__('%d states updated for %s', 'cartflow-locations'), count($new_states), $country_code),
            'states' => $states[$country_code],
        ));
    }

    /**
     * Set state visibility (hide/show from checkout)
     * Works for both built-in WooCommerce states and custom states
     */
    public function set_state_visibility($request) {
        $country_code = strtoupper($request->get_param('country_code'));
        $state_code = $request->get_param('state_code');
        $visible = $request->get_param('visible');

        $hidden = get_option($this->hidden_option_name, array());

        if (!isset($hidden[$country_code])) {
            $hidden[$country_code] = array();
        }

        if ($visible) {
            // Remove from hidden list
            $hidden[$country_code] = array_values(array_diff($hidden[$country_code], array($state_code)));
            if (empty($hidden[$country_code])) {
                unset($hidden[$country_code]);
            }
        } else {
            // Add to hidden list
            if (!in_array($state_code, $hidden[$country_code])) {
                $hidden[$country_code][] = $state_code;
            }
        }

        update_option($this->hidden_option_name, $hidden);
        $this->clear_wc_cache();

        return rest_ensure_response(array(
            'success' => true,
            'message' => $visible
                ? sprintf(__('State %s:%s is now visible in checkout', 'cartflow-locations'), $country_code, $state_code)
                : sprintf(__('State %s:%s is now hidden from checkout', 'cartflow-locations'), $country_code, $state_code),
            'country_code' => $country_code,
            'state_code' => $state_code,
            'visible' => $visible,
        ));
    }

    /**
     * Get all hidden states
     */
    public function get_hidden_states($request) {
        $hidden = get_option($this->hidden_option_name, array());
        return rest_ensure_response($hidden);
    }

    /**
     * Get all countries with states (WooCommerce + custom)
     */
    public function get_countries($request) {
        if (!class_exists('WC_Countries')) {
            return new WP_Error(
                'woocommerce_not_active',
                __('WooCommerce is not active.', 'cartflow-locations'),
                array('status' => 500)
            );
        }

        $wc_countries = new WC_Countries();
        $countries = $wc_countries->get_countries();
        $all_states = $wc_countries->get_states(); // This includes our custom states via filter

        $result = array();
        foreach ($countries as $code => $name) {
            $result[] = array(
                'code' => $code,
                'name' => $name,
                'states' => isset($all_states[$code]) ? $this->format_states($all_states[$code]) : array(),
            );
        }

        return rest_ensure_response($result);
    }

    /**
     * Format states array for response
     */
    private function format_states($states) {
        $formatted = array();
        foreach ($states as $code => $name) {
            $formatted[] = array(
                'code' => $code,
                'name' => $name,
            );
        }
        return $formatted;
    }

    /**
     * Inject custom states into WooCommerce and remove hidden states
     */
    public function add_custom_states($states) {
        // Add custom states
        $custom_states = get_option($this->option_name, array());

        foreach ($custom_states as $country_code => $country_states) {
            if (!isset($states[$country_code])) {
                $states[$country_code] = array();
            }

            foreach ($country_states as $state_code => $state_name) {
                $states[$country_code][$state_code] = $state_name;
            }

            // Sort states alphabetically by name
            if (!empty($states[$country_code])) {
                asort($states[$country_code]);
            }
        }

        // Remove hidden states (works for both built-in and custom states)
        $hidden_states = get_option($this->hidden_option_name, array());

        foreach ($hidden_states as $country_code => $hidden_codes) {
            if (isset($states[$country_code]) && is_array($hidden_codes)) {
                foreach ($hidden_codes as $state_code) {
                    unset($states[$country_code][$state_code]);
                }
            }
        }

        return $states;
    }

    /**
     * Clear WooCommerce cache
     */
    private function clear_wc_cache() {
        delete_transient('wc_countries');
        delete_transient('wc_countries_states');

        if (function_exists('wc_cache_flush')) {
            wc_cache_flush();
        }
    }

    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        add_submenu_page(
            'woocommerce',
            __('CartFlow Locations', 'cartflow-locations'),
            __('CartFlow Locations', 'cartflow-locations'),
            'manage_woocommerce',
            'cartflow-locations',
            array($this, 'render_admin_page')
        );
    }

    /**
     * Render admin page
     */
    public function render_admin_page() {
        $states = get_option($this->option_name, array());
        $api_key = get_option('cartflow_api_key', '');

        // Handle form submissions
        if (isset($_POST['cartflow_generate_api_key']) && check_admin_referer('cartflow_locations_nonce')) {
            $api_key = wp_generate_password(32, false);
            update_option('cartflow_api_key', $api_key);
            echo '<div class="notice notice-success"><p>' . __('API Key generated!', 'cartflow-locations') . '</p></div>';
        }

        if (isset($_POST['cartflow_add_state']) && check_admin_referer('cartflow_locations_nonce')) {
            $country = sanitize_text_field($_POST['country_code']);
            $state_code = sanitize_text_field($_POST['state_code']);
            $state_name = sanitize_text_field($_POST['state_name']);

            if ($country && $state_code && $state_name) {
                if (!isset($states[$country])) {
                    $states[$country] = array();
                }
                $states[$country][$state_code] = $state_name;
                update_option($this->option_name, $states);
                $this->clear_wc_cache();
                echo '<div class="notice notice-success"><p>' . __('State added!', 'cartflow-locations') . '</p></div>';
            }
        }

        if (isset($_POST['cartflow_delete_state']) && check_admin_referer('cartflow_locations_nonce')) {
            $country = sanitize_text_field($_POST['delete_country']);
            $state = sanitize_text_field($_POST['delete_state']);

            if (isset($states[$country][$state])) {
                unset($states[$country][$state]);
                if (empty($states[$country])) {
                    unset($states[$country]);
                }
                update_option($this->option_name, $states);
                $this->clear_wc_cache();
                echo '<div class="notice notice-success"><p>' . __('State deleted!', 'cartflow-locations') . '</p></div>';
            }
        }

        // Refresh states after updates
        $states = get_option($this->option_name, array());

        ?>
        <div class="wrap">
            <h1><?php _e('CartFlow Custom Locations', 'cartflow-locations'); ?></h1>

            <h2><?php _e('API Configuration', 'cartflow-locations'); ?></h2>
            <table class="form-table">
                <tr>
                    <th><?php _e('API Key', 'cartflow-locations'); ?></th>
                    <td>
                        <code><?php echo esc_html($api_key ?: __('Not generated', 'cartflow-locations')); ?></code>
                        <form method="post" style="display:inline;">
                            <?php wp_nonce_field('cartflow_locations_nonce'); ?>
                            <input type="submit" name="cartflow_generate_api_key" class="button" value="<?php _e('Generate New Key', 'cartflow-locations'); ?>">
                        </form>
                        <p class="description"><?php _e('Use this key in the X-CartFlow-API-Key header for API authentication.', 'cartflow-locations'); ?></p>
                    </td>
                </tr>
                <tr>
                    <th><?php _e('API Endpoints', 'cartflow-locations'); ?></th>
                    <td>
                        <code>GET/POST <?php echo rest_url('cartflow/v1/locations/states'); ?></code><br>
                        <code>PUT/DELETE <?php echo rest_url('cartflow/v1/locations/states/{country}/{state}'); ?></code><br>
                        <code>POST <?php echo rest_url('cartflow/v1/locations/states/{country}/bulk'); ?></code><br>
                        <code>GET <?php echo rest_url('cartflow/v1/locations/countries'); ?></code>
                    </td>
                </tr>
            </table>

            <hr>

            <h2><?php _e('Add Custom State', 'cartflow-locations'); ?></h2>
            <form method="post">
                <?php wp_nonce_field('cartflow_locations_nonce'); ?>
                <table class="form-table">
                    <tr>
                        <th><label for="country_code"><?php _e('Country Code', 'cartflow-locations'); ?></label></th>
                        <td><input type="text" name="country_code" id="country_code" placeholder="EG" maxlength="2" style="text-transform:uppercase;" required></td>
                    </tr>
                    <tr>
                        <th><label for="state_code"><?php _e('State Code', 'cartflow-locations'); ?></label></th>
                        <td><input type="text" name="state_code" id="state_code" placeholder="CAIRO" required></td>
                    </tr>
                    <tr>
                        <th><label for="state_name"><?php _e('State Name', 'cartflow-locations'); ?></label></th>
                        <td><input type="text" name="state_name" id="state_name" placeholder="Cairo" required></td>
                    </tr>
                </table>
                <p><input type="submit" name="cartflow_add_state" class="button button-primary" value="<?php _e('Add State', 'cartflow-locations'); ?>"></p>
            </form>

            <hr>

            <h2><?php _e('Custom States', 'cartflow-locations'); ?></h2>
            <?php if (empty($states)): ?>
                <p><?php _e('No custom states added yet.', 'cartflow-locations'); ?></p>
            <?php else: ?>
                <table class="wp-list-table widefat fixed striped">
                    <thead>
                        <tr>
                            <th><?php _e('Country', 'cartflow-locations'); ?></th>
                            <th><?php _e('State Code', 'cartflow-locations'); ?></th>
                            <th><?php _e('State Name', 'cartflow-locations'); ?></th>
                            <th><?php _e('Actions', 'cartflow-locations'); ?></th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($states as $country => $country_states): ?>
                            <?php foreach ($country_states as $code => $name): ?>
                                <tr>
                                    <td><?php echo esc_html($country); ?></td>
                                    <td><?php echo esc_html($code); ?></td>
                                    <td><?php echo esc_html($name); ?></td>
                                    <td>
                                        <form method="post" style="display:inline;">
                                            <?php wp_nonce_field('cartflow_locations_nonce'); ?>
                                            <input type="hidden" name="delete_country" value="<?php echo esc_attr($country); ?>">
                                            <input type="hidden" name="delete_state" value="<?php echo esc_attr($code); ?>">
                                            <input type="submit" name="cartflow_delete_state" class="button button-small" value="<?php _e('Delete', 'cartflow-locations'); ?>" onclick="return confirm('<?php _e('Are you sure?', 'cartflow-locations'); ?>');">
                                        </form>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>
        </div>
        <?php
    }
}

// Initialize the plugin
add_action('plugins_loaded', array('CartFlow_Custom_Locations', 'get_instance'));
