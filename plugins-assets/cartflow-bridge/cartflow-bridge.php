<?php
/**
 * Plugin Name: CartFlow Bridge
 * Plugin URI: https://cartflow.app
 * Description: REST API bridge for CartFlow to manage WordPress & WooCommerce settings, smart shipping, checkout currency conversion, and custom product fields
 * Version: 1.7.0
 * Author: CartFlow
 * Author URI: https://cartflow.app
 * License: GPL v2 or later
 * Text Domain: cartflow-bridge
 * Requires at least: 5.0
 * Requires PHP: 7.4
 * WC requires at least: 5.0
 */

if (!defined('ABSPATH')) {
    exit;
}

class CartFlow_Bridge {

    private static $instance = null;
    private $namespace = 'cartflow/v1';
    private $override_decimals = null;

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('rest_api_init', array($this, 'register_rest_routes'));
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));

        // Smart Shipping: Hide other methods when free shipping is available
        if (get_option('cartflow_hide_shipping_when_free', 'yes') === 'yes') {
            add_filter('woocommerce_package_rates', array($this, 'hide_shipping_when_free_available'), 100, 2);
        }

        // Currency Conversion: Convert order totals at checkout + show notice
        $currency_settings = get_option('cartflow_currency_features', array());
        if (!empty($currency_settings['enabled'])) {
            // Use woocommerce_checkout_order_processed (fires AFTER all items including
            // shipping are added to the order, but BEFORE payment processing).
            // The earlier woocommerce_checkout_create_order hook fires before shipping
            // lines exist, so shipping totals were never converted.
            add_action('woocommerce_checkout_order_processed', array($this, 'convert_order_currency_by_id'), 10, 3);
            // Block checkout (Store API) uses a different hook
            add_action('woocommerce_store_api_checkout_order_processed', array($this, 'convert_order_currency'), 10, 1);
            add_action('woocommerce_review_order_after_order_total', array($this, 'display_currency_conversion_notice'));
            add_action('wp_footer', array($this, 'currency_conversion_checkout_script'));
        }

        // Custom Product Fields: Render fields on product pages and capture in orders
        $custom_fieldsets = get_option('cartflow_custom_fieldsets', array());
        if (!empty($custom_fieldsets)) {
            add_action('woocommerce_before_add_to_cart_button', array($this, 'render_custom_fields'));
            add_filter('woocommerce_add_to_cart_validation', array($this, 'validate_custom_fields'), 10, 3);
            add_filter('woocommerce_add_cart_item_data', array($this, 'add_custom_fields_to_cart'), 10, 3);
            add_filter('woocommerce_get_item_data', array($this, 'display_custom_fields_in_cart'), 10, 2);
            add_action('woocommerce_checkout_create_order_line_item', array($this, 'save_custom_fields_to_order'), 10, 4);
            add_filter('woocommerce_order_item_display_meta_key', array($this, 'clean_custom_field_meta_key'), 10, 3);
            // Price add-ons
            add_action('woocommerce_before_calculate_totals', array($this, 'apply_custom_field_prices'), 20, 1);
            // Order-level fields on checkout
            add_action('woocommerce_before_order_notes', array($this, 'render_order_level_fields'));
            add_action('woocommerce_checkout_order_created', array($this, 'save_order_level_fields_hpos'), 10, 1);
            add_action('woocommerce_checkout_update_order_meta', array($this, 'save_order_level_fields'), 10, 1);
        }
    }

    /**
     * Hide other shipping methods when free shipping is available
     * This prevents customers from seeing paid options when they qualify for free shipping
     */
    public function hide_shipping_when_free_available($rates, $package = array()) {
        // Safety checks - don't filter if rates is empty or not an array
        if (empty($rates) || !is_array($rates)) {
            return $rates;
        }

        $free_shipping = array();

        // Find free shipping methods
        foreach ($rates as $rate_id => $rate) {
            if (is_object($rate) && isset($rate->method_id) && 'free_shipping' === $rate->method_id) {
                $free_shipping[$rate_id] = $rate;
            }
        }

        // Only filter if free shipping is actually available
        // If no free shipping found, return ALL original rates unchanged
        if (empty($free_shipping)) {
            return $rates;
        }

        return $free_shipping;
    }

    /**
     * Register all REST API routes
     */
    public function register_rest_routes() {
        // ==================== GENERAL SETTINGS ====================

        // Get all general settings
        register_rest_route($this->namespace, '/settings/general', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_general_settings'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // Update general settings
        register_rest_route($this->namespace, '/settings/general', array(
            'methods' => 'POST',
            'callback' => array($this, 'update_general_settings'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // ==================== READING SETTINGS ====================

        register_rest_route($this->namespace, '/settings/reading', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_reading_settings'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route($this->namespace, '/settings/reading', array(
            'methods' => 'POST',
            'callback' => array($this, 'update_reading_settings'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // ==================== DISCUSSION SETTINGS ====================

        register_rest_route($this->namespace, '/settings/discussion', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_discussion_settings'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route($this->namespace, '/settings/discussion', array(
            'methods' => 'POST',
            'callback' => array($this, 'update_discussion_settings'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // ==================== PERMALINK SETTINGS ====================

        register_rest_route($this->namespace, '/settings/permalinks', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_permalink_settings'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route($this->namespace, '/settings/permalinks', array(
            'methods' => 'POST',
            'callback' => array($this, 'update_permalink_settings'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // ==================== WOOCOMMERCE SETTINGS ====================

        register_rest_route($this->namespace, '/settings/woocommerce', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_woocommerce_settings'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route($this->namespace, '/settings/woocommerce', array(
            'methods' => 'POST',
            'callback' => array($this, 'update_woocommerce_settings'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // ==================== CUSTOM OPTIONS ====================

        // Get any WordPress option
        register_rest_route($this->namespace, '/options/(?P<option_name>[a-zA-Z0-9_-]+)', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_option'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // Update any WordPress option
        register_rest_route($this->namespace, '/options/(?P<option_name>[a-zA-Z0-9_-]+)', array(
            'methods' => 'POST',
            'callback' => array($this, 'update_option'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // Get multiple options at once
        register_rest_route($this->namespace, '/options', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_options'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // Update multiple options at once
        register_rest_route($this->namespace, '/options', array(
            'methods' => 'POST',
            'callback' => array($this, 'update_options'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // ==================== CUSTOM LOCATIONS ====================

        register_rest_route($this->namespace, '/locations/states', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_custom_states'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route($this->namespace, '/locations/states', array(
            'methods' => 'POST',
            'callback' => array($this, 'add_custom_state'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route($this->namespace, '/locations/states/(?P<country_code>[A-Z]{2})/(?P<state_code>[A-Za-z0-9_-]+)', array(
            'methods' => 'PUT',
            'callback' => array($this, 'update_custom_state'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route($this->namespace, '/locations/states/(?P<country_code>[A-Z]{2})/(?P<state_code>[A-Za-z0-9_-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'delete_custom_state'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route($this->namespace, '/locations/states/(?P<country_code>[A-Z]{2})/bulk', array(
            'methods' => 'POST',
            'callback' => array($this, 'bulk_update_states'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route($this->namespace, '/locations/countries', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_countries'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // ==================== STATE VISIBILITY ====================

        register_rest_route($this->namespace, '/locations/states/(?P<country_code>[A-Z]{2})/(?P<state_code>[A-Za-z0-9_-]+)/visibility', array(
            'methods' => 'PUT',
            'callback' => array($this, 'set_state_visibility'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route($this->namespace, '/locations/hidden-states', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_hidden_states'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // ==================== STATE GROUPS ====================

        register_rest_route($this->namespace, '/locations/groups', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_state_groups'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route($this->namespace, '/locations/groups', array(
            'methods' => 'POST',
            'callback' => array($this, 'sync_state_groups'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route($this->namespace, '/locations/states-by-group/(?P<country_code>[A-Z]{2})', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_states_by_group'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // ==================== SYSTEM INFO ====================

        register_rest_route($this->namespace, '/system/info', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_system_info'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route($this->namespace, '/system/plugins', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_plugins'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route($this->namespace, '/system/themes', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_themes'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // ==================== PLUGIN INFO ====================

        register_rest_route($this->namespace, '/plugin/info', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_plugin_info'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // ==================== CARTFLOW FEATURES ====================

        register_rest_route($this->namespace, '/features/shipping', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_shipping_features'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route($this->namespace, '/features/shipping', array(
            'methods' => 'POST',
            'callback' => array($this, 'update_shipping_features'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // ==================== CURRENCY CONVERSION FEATURES ====================

        register_rest_route($this->namespace, '/features/currency', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_currency_features'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route($this->namespace, '/features/currency', array(
            'methods' => 'POST',
            'callback' => array($this, 'update_currency_features'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        register_rest_route($this->namespace, '/features/currency/live-rate', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_live_exchange_rate'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // ==================== CUSTOM FIELDSETS ====================

        // Sync custom fieldsets from CartFlow backend
        register_rest_route($this->namespace, '/custom-fieldsets/sync', array(
            'methods' => 'POST',
            'callback' => array($this, 'sync_custom_fieldsets'),
            'permission_callback' => array($this, 'check_permission'),
        ));

        // Get stored custom fieldsets
        register_rest_route($this->namespace, '/custom-fieldsets', array(
            'methods' => 'GET',
            'callback' => array($this, 'get_custom_fieldsets'),
            'permission_callback' => array($this, 'check_permission'),
        ));
    }

    /**
     * Check API permission - Direct WooCommerce API key validation
     */
    public function check_permission($request) {
        // Check custom API key first (doesn't require WooCommerce)
        $api_key = $request->get_header('X-CartFlow-API-Key');
        $stored_key = get_option('cartflow_bridge_api_key');
        if ($api_key && $stored_key && hash_equals($stored_key, $api_key)) {
            return true;
        }

        // Extract credentials from Basic Auth or query params
        $consumer_key = null;
        $consumer_secret = null;

        // Check Basic Auth header first
        $auth_header = $request->get_header('Authorization');
        if ($auth_header && strpos($auth_header, 'Basic ') === 0) {
            $credentials = base64_decode(substr($auth_header, 6));
            if ($credentials) {
                $parts = explode(':', $credentials, 2);
                if (count($parts) === 2) {
                    $consumer_key = $parts[0];
                    $consumer_secret = $parts[1];
                }
            }
        }

        // Fallback to query params
        if (!$consumer_key) {
            $consumer_key = $request->get_param('consumer_key');
            $consumer_secret = $request->get_param('consumer_secret');
        }

        // Validate WooCommerce API keys directly (no WC_REST_Authentication to avoid state issues)
        if ($consumer_key && $consumer_secret && function_exists('wc_api_hash')) {
            global $wpdb;
            $table_name = $wpdb->prefix . 'woocommerce_api_keys';

            // Direct query - simple and stateless
            $key = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT consumer_secret, permissions, user_id FROM {$table_name} WHERE consumer_key = %s",
                    wc_api_hash($consumer_key)
                )
            );

            if ($key && hash_equals($key->consumer_secret, $consumer_secret)) {
                // Verify API key has sufficient permissions
                $method = $request->get_method();
                if ($method === 'GET' && in_array($key->permissions, array('read', 'read_write'), true)) {
                    return true;
                }
                if (in_array($method, array('POST', 'PUT', 'PATCH', 'DELETE'), true) && $key->permissions === 'read_write') {
                    return true;
                }
                return new WP_Error(
                    'cartflow_insufficient_permissions',
                    'CartFlow Bridge: API key does not have sufficient permissions for this operation.',
                    array('status' => 403)
                );
            }
        }

        // Try WordPress Application Password
        if ($auth_header && strpos($auth_header, 'Basic ') === 0 && function_exists('wp_authenticate_application_password')) {
            $credentials = base64_decode(substr($auth_header, 6));
            if ($credentials) {
                $parts = explode(':', $credentials, 2);
                if (count($parts) === 2) {
                    $user = wp_authenticate_application_password(null, $parts[0], $parts[1]);
                    if ($user && !is_wp_error($user) && user_can($user, 'manage_options')) {
                        return true;
                    }
                }
            }
        }

        return new WP_Error(
            'cartflow_auth_failed',
            'CartFlow Bridge: Authentication failed. Please check your WooCommerce API credentials.',
            array('status' => 401)
        );
    }

    // ==================== GENERAL SETTINGS ====================

    public function get_general_settings($request) {
        try {
            $response = array(
                'blogname' => get_option('blogname'),
                'blogdescription' => get_option('blogdescription'),
                'siteurl' => get_option('siteurl'),
                'home' => get_option('home'),
                'admin_email' => get_option('admin_email'),
                'users_can_register' => (bool) get_option('users_can_register'),
                'default_role' => get_option('default_role'),
                'WPLANG' => get_option('WPLANG'),
                'timezone_string' => get_option('timezone_string'),
                'gmt_offset' => get_option('gmt_offset'),
                'date_format' => get_option('date_format'),
                'time_format' => get_option('time_format'),
                'start_of_week' => (int) get_option('start_of_week'),
            );

            // Safely get roles
            if (function_exists('wp_roles')) {
                $wp_roles = wp_roles();
                $response['available_roles'] = $wp_roles ? array_keys($wp_roles->roles) : array();
            } else {
                $response['available_roles'] = array();
            }

            // Keep timezone list small - just common ones
            $response['available_timezones'] = array(
                'UTC', 'Africa/Cairo', 'Africa/Lagos', 'America/New_York',
                'America/Los_Angeles', 'America/Chicago', 'Europe/London',
                'Europe/Paris', 'Asia/Dubai', 'Asia/Tokyo', 'Asia/Shanghai',
                'Australia/Sydney'
            );

            $response['available_date_formats'] = array('F j, Y', 'Y-m-d', 'm/d/Y', 'd/m/Y', 'j F Y');
            $response['available_time_formats'] = array('g:i a', 'g:i A', 'H:i');

            return rest_ensure_response($response);
        } catch (Exception $e) {
            return new WP_Error('settings_error', $e->getMessage(), array('status' => 500));
        }
    }

    public function update_general_settings($request) {
        try {
            $params = $request->get_json_params();

            if (empty($params)) {
                return new WP_Error('invalid_params', 'No parameters provided', array('status' => 400));
            }

            $updated = array();

            $allowed_options = array(
                'blogname',
                'blogdescription',
                'admin_email',
                'users_can_register',
                'default_role',
                'WPLANG',
                'timezone_string',
                'gmt_offset',
                'date_format',
                'time_format',
                'start_of_week',
            );

            foreach ($allowed_options as $option) {
                if (isset($params[$option])) {
                    update_option($option, $params[$option]);
                    $updated[$option] = $params[$option];
                }
            }

            return rest_ensure_response(array(
                'success' => true,
                'message' => 'Settings updated successfully.',
                'updated' => $updated,
            ));
        } catch (Exception $e) {
            return new WP_Error('update_error', $e->getMessage(), array('status' => 500));
        }
    }

    // ==================== READING SETTINGS ====================

    public function get_reading_settings($request) {
        return rest_ensure_response(array(
            'show_on_front' => get_option('show_on_front'),
            'page_on_front' => (int) get_option('page_on_front'),
            'page_for_posts' => (int) get_option('page_for_posts'),
            'posts_per_page' => (int) get_option('posts_per_page'),
            'posts_per_rss' => (int) get_option('posts_per_rss'),
            'rss_use_excerpt' => (bool) get_option('rss_use_excerpt'),
            'blog_public' => (bool) get_option('blog_public'),
        ));
    }

    public function update_reading_settings($request) {
        $params = $request->get_json_params();
        $updated = array();

        $allowed_options = array(
            'show_on_front',
            'page_on_front',
            'page_for_posts',
            'posts_per_page',
            'posts_per_rss',
            'rss_use_excerpt',
            'blog_public',
        );

        foreach ($allowed_options as $option) {
            if (isset($params[$option])) {
                update_option($option, $params[$option]);
                $updated[$option] = $params[$option];
            }
        }

        return rest_ensure_response(array(
            'success' => true,
            'message' => __('Reading settings updated.', 'cartflow-bridge'),
            'updated' => $updated,
        ));
    }

    // ==================== DISCUSSION SETTINGS ====================

    public function get_discussion_settings($request) {
        return rest_ensure_response(array(
            'default_pingback_flag' => (bool) get_option('default_pingback_flag'),
            'default_ping_status' => get_option('default_ping_status'),
            'default_comment_status' => get_option('default_comment_status'),
            'require_name_email' => (bool) get_option('require_name_email'),
            'comment_registration' => (bool) get_option('comment_registration'),
            'close_comments_for_old_posts' => (bool) get_option('close_comments_for_old_posts'),
            'close_comments_days_old' => (int) get_option('close_comments_days_old'),
            'thread_comments' => (bool) get_option('thread_comments'),
            'thread_comments_depth' => (int) get_option('thread_comments_depth'),
            'page_comments' => (bool) get_option('page_comments'),
            'comments_per_page' => (int) get_option('comments_per_page'),
            'default_comments_page' => get_option('default_comments_page'),
            'comment_order' => get_option('comment_order'),
            'comment_moderation' => (bool) get_option('comment_moderation'),
            'moderation_notify' => (bool) get_option('moderation_notify'),
            'comments_notify' => (bool) get_option('comments_notify'),
        ));
    }

    public function update_discussion_settings($request) {
        $params = $request->get_json_params();
        $updated = array();

        $allowed_options = array(
            'default_pingback_flag',
            'default_ping_status',
            'default_comment_status',
            'require_name_email',
            'comment_registration',
            'close_comments_for_old_posts',
            'close_comments_days_old',
            'thread_comments',
            'thread_comments_depth',
            'page_comments',
            'comments_per_page',
            'default_comments_page',
            'comment_order',
            'comment_moderation',
            'moderation_notify',
            'comments_notify',
        );

        foreach ($allowed_options as $option) {
            if (isset($params[$option])) {
                update_option($option, $params[$option]);
                $updated[$option] = $params[$option];
            }
        }

        return rest_ensure_response(array(
            'success' => true,
            'message' => __('Discussion settings updated.', 'cartflow-bridge'),
            'updated' => $updated,
        ));
    }

    // ==================== PERMALINK SETTINGS ====================

    public function get_permalink_settings($request) {
        return rest_ensure_response(array(
            'permalink_structure' => get_option('permalink_structure'),
            'category_base' => get_option('category_base'),
            'tag_base' => get_option('tag_base'),
            'woocommerce_permalink_structure' => array(
                'product_base' => get_option('woocommerce_permalinks', array())['product_base'] ?? '',
                'category_base' => get_option('woocommerce_permalinks', array())['category_base'] ?? 'product-category',
                'tag_base' => get_option('woocommerce_permalinks', array())['tag_base'] ?? 'product-tag',
                'attribute_base' => get_option('woocommerce_permalinks', array())['attribute_base'] ?? '',
            ),
        ));
    }

    public function update_permalink_settings($request) {
        $params = $request->get_json_params();
        $updated = array();

        if (isset($params['permalink_structure'])) {
            update_option('permalink_structure', $params['permalink_structure']);
            $updated['permalink_structure'] = $params['permalink_structure'];
        }

        if (isset($params['category_base'])) {
            update_option('category_base', $params['category_base']);
            $updated['category_base'] = $params['category_base'];
        }

        if (isset($params['tag_base'])) {
            update_option('tag_base', $params['tag_base']);
            $updated['tag_base'] = $params['tag_base'];
        }

        // Flush rewrite rules if permalinks changed
        if (!empty($updated)) {
            flush_rewrite_rules();
        }

        return rest_ensure_response(array(
            'success' => true,
            'message' => __('Permalink settings updated.', 'cartflow-bridge'),
            'updated' => $updated,
        ));
    }

    // ==================== WOOCOMMERCE SETTINGS ====================

    public function get_woocommerce_settings($request) {
        if (!class_exists('WooCommerce')) {
            return new WP_Error('woocommerce_not_active', __('WooCommerce is not active.', 'cartflow-bridge'), array('status' => 400));
        }

        return rest_ensure_response(array(
            // Store Address
            'store_address' => get_option('woocommerce_store_address'),
            'store_address_2' => get_option('woocommerce_store_address_2'),
            'store_city' => get_option('woocommerce_store_city'),
            'store_postcode' => get_option('woocommerce_store_postcode'),
            'default_country' => get_option('woocommerce_default_country'),

            // General
            'currency' => get_option('woocommerce_currency'),
            'currency_pos' => get_option('woocommerce_currency_pos'),
            'price_thousand_sep' => get_option('woocommerce_price_thousand_sep'),
            'price_decimal_sep' => get_option('woocommerce_price_decimal_sep'),
            'price_num_decimals' => (int) get_option('woocommerce_price_num_decimals'),

            // Selling Locations
            'allowed_countries' => get_option('woocommerce_allowed_countries'),
            'specific_allowed_countries' => get_option('woocommerce_specific_allowed_countries', array()),
            'ship_to_countries' => get_option('woocommerce_ship_to_countries'),
            'specific_ship_to_countries' => get_option('woocommerce_specific_ship_to_countries', array()),

            // Checkout
            'enable_guest_checkout' => get_option('woocommerce_enable_guest_checkout'),
            'enable_checkout_login_reminder' => get_option('woocommerce_enable_checkout_login_reminder'),
            'enable_signup_and_login_from_checkout' => get_option('woocommerce_enable_signup_and_login_from_checkout'),
            'registration_generate_username' => get_option('woocommerce_registration_generate_username'),
            'registration_generate_password' => get_option('woocommerce_registration_generate_password'),

            // Products
            'weight_unit' => get_option('woocommerce_weight_unit'),
            'dimension_unit' => get_option('woocommerce_dimension_unit'),
            'enable_reviews' => get_option('woocommerce_enable_reviews'),
            'review_rating_verification_required' => get_option('woocommerce_review_rating_verification_required'),
            'review_rating_required' => get_option('woocommerce_review_rating_required'),

            // Inventory
            'manage_stock' => get_option('woocommerce_manage_stock'),
            'hold_stock_minutes' => (int) get_option('woocommerce_hold_stock_minutes'),
            'notify_low_stock' => get_option('woocommerce_notify_low_stock'),
            'notify_no_stock' => get_option('woocommerce_notify_no_stock'),
            'stock_email_recipient' => get_option('woocommerce_stock_email_recipient'),
            'notify_low_stock_amount' => (int) get_option('woocommerce_notify_low_stock_amount'),
            'notify_no_stock_amount' => (int) get_option('woocommerce_notify_no_stock_amount'),
            'hide_out_of_stock_items' => get_option('woocommerce_hide_out_of_stock_items'),
            'stock_format' => get_option('woocommerce_stock_format'),

            // Tax
            'calc_taxes' => get_option('woocommerce_calc_taxes'),
            'prices_include_tax' => get_option('woocommerce_prices_include_tax'),
            'tax_based_on' => get_option('woocommerce_tax_based_on'),
            'tax_round_at_subtotal' => get_option('woocommerce_tax_round_at_subtotal'),
            'tax_display_shop' => get_option('woocommerce_tax_display_shop'),
            'tax_display_cart' => get_option('woocommerce_tax_display_cart'),
            'tax_total_display' => get_option('woocommerce_tax_total_display'),

            // Shipping
            'enable_shipping_calc' => get_option('woocommerce_enable_shipping_calc'),
            'shipping_cost_requires_address' => get_option('woocommerce_shipping_cost_requires_address'),
            'ship_to_destination' => get_option('woocommerce_ship_to_destination'),
            'shipping_debug_mode' => get_option('woocommerce_shipping_debug_mode'),

            // Email
            'email_from_name' => get_option('woocommerce_email_from_name'),
            'email_from_address' => get_option('woocommerce_email_from_address'),
        ));
    }

    public function update_woocommerce_settings($request) {
        if (!class_exists('WooCommerce')) {
            return new WP_Error('woocommerce_not_active', __('WooCommerce is not active.', 'cartflow-bridge'), array('status' => 400));
        }

        $params = $request->get_json_params();
        $updated = array();

        // Map of allowed WooCommerce options
        $allowed_options = array(
            'store_address' => 'woocommerce_store_address',
            'store_address_2' => 'woocommerce_store_address_2',
            'store_city' => 'woocommerce_store_city',
            'store_postcode' => 'woocommerce_store_postcode',
            'default_country' => 'woocommerce_default_country',
            'currency' => 'woocommerce_currency',
            'currency_pos' => 'woocommerce_currency_pos',
            'price_thousand_sep' => 'woocommerce_price_thousand_sep',
            'price_decimal_sep' => 'woocommerce_price_decimal_sep',
            'price_num_decimals' => 'woocommerce_price_num_decimals',
            'allowed_countries' => 'woocommerce_allowed_countries',
            'specific_allowed_countries' => 'woocommerce_specific_allowed_countries',
            'ship_to_countries' => 'woocommerce_ship_to_countries',
            'specific_ship_to_countries' => 'woocommerce_specific_ship_to_countries',
            'enable_guest_checkout' => 'woocommerce_enable_guest_checkout',
            'enable_checkout_login_reminder' => 'woocommerce_enable_checkout_login_reminder',
            'enable_signup_and_login_from_checkout' => 'woocommerce_enable_signup_and_login_from_checkout',
            'registration_generate_username' => 'woocommerce_registration_generate_username',
            'registration_generate_password' => 'woocommerce_registration_generate_password',
            'weight_unit' => 'woocommerce_weight_unit',
            'dimension_unit' => 'woocommerce_dimension_unit',
            'enable_reviews' => 'woocommerce_enable_reviews',
            'review_rating_verification_required' => 'woocommerce_review_rating_verification_required',
            'review_rating_required' => 'woocommerce_review_rating_required',
            'manage_stock' => 'woocommerce_manage_stock',
            'hold_stock_minutes' => 'woocommerce_hold_stock_minutes',
            'notify_low_stock' => 'woocommerce_notify_low_stock',
            'notify_no_stock' => 'woocommerce_notify_no_stock',
            'stock_email_recipient' => 'woocommerce_stock_email_recipient',
            'notify_low_stock_amount' => 'woocommerce_notify_low_stock_amount',
            'notify_no_stock_amount' => 'woocommerce_notify_no_stock_amount',
            'hide_out_of_stock_items' => 'woocommerce_hide_out_of_stock_items',
            'stock_format' => 'woocommerce_stock_format',
            'calc_taxes' => 'woocommerce_calc_taxes',
            'prices_include_tax' => 'woocommerce_prices_include_tax',
            'tax_based_on' => 'woocommerce_tax_based_on',
            'tax_round_at_subtotal' => 'woocommerce_tax_round_at_subtotal',
            'tax_display_shop' => 'woocommerce_tax_display_shop',
            'tax_display_cart' => 'woocommerce_tax_display_cart',
            'tax_total_display' => 'woocommerce_tax_total_display',
            'enable_shipping_calc' => 'woocommerce_enable_shipping_calc',
            'shipping_cost_requires_address' => 'woocommerce_shipping_cost_requires_address',
            'ship_to_destination' => 'woocommerce_ship_to_destination',
            'shipping_debug_mode' => 'woocommerce_shipping_debug_mode',
            'email_from_name' => 'woocommerce_email_from_name',
            'email_from_address' => 'woocommerce_email_from_address',
        );

        foreach ($allowed_options as $key => $option_name) {
            if (isset($params[$key])) {
                update_option($option_name, $params[$key]);
                $updated[$key] = $params[$key];
            }
        }

        // Clear WooCommerce transients
        if (function_exists('wc_cache_flush')) {
            wc_cache_flush();
        }

        return rest_ensure_response(array(
            'success' => true,
            'message' => __('WooCommerce settings updated.', 'cartflow-bridge'),
            'updated' => $updated,
        ));
    }

    // ==================== CUSTOM OPTIONS ====================

    public function get_option($request) {
        $option_name = $request->get_param('option_name');
        $value = get_option($option_name);

        if ($value === false) {
            return new WP_Error('option_not_found', __('Option not found.', 'cartflow-bridge'), array('status' => 404));
        }

        return rest_ensure_response(array(
            'option' => $option_name,
            'value' => $value,
        ));
    }

    public function update_option($request) {
        $option_name = $request->get_param('option_name');
        $params = $request->get_json_params();

        if (!isset($params['value'])) {
            return new WP_Error('missing_value', __('Value is required.', 'cartflow-bridge'), array('status' => 400));
        }

        // Security: Block sensitive options
        $blocked_options = array(
            'siteurl', 'home', // Can break site
            'active_plugins', // Can deactivate plugins
            'template', 'stylesheet', // Can break theme
            'admin_email', // Protected separately
            'users_can_register', // Security sensitive
        );

        if (in_array($option_name, $blocked_options)) {
            return new WP_Error('option_blocked', __('This option cannot be modified via API.', 'cartflow-bridge'), array('status' => 403));
        }

        update_option($option_name, $params['value']);

        return rest_ensure_response(array(
            'success' => true,
            'option' => $option_name,
            'value' => $params['value'],
        ));
    }

    public function get_options($request) {
        $option_names = $request->get_param('options');

        if (!$option_names) {
            return new WP_Error('missing_options', __('Options parameter is required.', 'cartflow-bridge'), array('status' => 400));
        }

        $names = explode(',', $option_names);
        $result = array();

        foreach ($names as $name) {
            $name = trim($name);
            $result[$name] = get_option($name);
        }

        return rest_ensure_response($result);
    }

    public function update_options($request) {
        $params = $request->get_json_params();
        $updated = array();

        $blocked_options = array('siteurl', 'home', 'active_plugins', 'template', 'stylesheet');

        foreach ($params as $option_name => $value) {
            if (in_array($option_name, $blocked_options)) {
                continue;
            }
            update_option($option_name, $value);
            $updated[$option_name] = $value;
        }

        return rest_ensure_response(array(
            'success' => true,
            'updated' => $updated,
        ));
    }

    // ==================== CUSTOM LOCATIONS ====================

    public function get_custom_states($request) {
        return rest_ensure_response(get_option('cartflow_custom_states', array()));
    }

    public function add_custom_state($request) {
        $params = $request->get_json_params();
        $country_code = strtoupper($params['country_code'] ?? '');
        $state_code = $params['state_code'] ?? '';
        $state_name = $params['state_name'] ?? '';

        if (!$country_code || !$state_code || !$state_name) {
            return new WP_Error('missing_params', __('country_code, state_code, and state_name are required.', 'cartflow-bridge'), array('status' => 400));
        }

        $states = get_option('cartflow_custom_states', array());

        if (!isset($states[$country_code])) {
            $states[$country_code] = array();
        }

        if (isset($states[$country_code][$state_code])) {
            return new WP_Error('state_exists', __('State already exists.', 'cartflow-bridge'), array('status' => 409));
        }

        $states[$country_code][$state_code] = $state_name;
        update_option('cartflow_custom_states', $states);
        $this->clear_wc_cache();

        return rest_ensure_response(array(
            'success' => true,
            'state' => array('country_code' => $country_code, 'state_code' => $state_code, 'state_name' => $state_name),
        ));
    }

    public function update_custom_state($request) {
        $country_code = strtoupper($request->get_param('country_code'));
        $state_code = $request->get_param('state_code');
        $params = $request->get_json_params();
        $state_name = $params['state_name'] ?? '';

        if (!$state_name) {
            return new WP_Error('missing_params', __('state_name is required.', 'cartflow-bridge'), array('status' => 400));
        }

        $states = get_option('cartflow_custom_states', array());

        // Check if this is an existing custom state or a WooCommerce default state we're overriding
        $is_update = isset($states[$country_code][$state_code]);
        $is_override = false;

        if (!$is_update) {
            // Check if this state exists in WooCommerce defaults (we're creating an override)
            if (class_exists('WC_Countries')) {
                $wc_countries = new WC_Countries();
                $wc_states = $wc_countries->get_states($country_code);
                if (isset($wc_states[$state_code])) {
                    $is_override = true;
                }
            }
        }

        // If it's neither an existing custom state nor a WooCommerce state, return 404
        if (!$is_update && !$is_override) {
            return new WP_Error('state_not_found', __('State not found in custom states or WooCommerce defaults.', 'cartflow-bridge'), array('status' => 404));
        }

        // Initialize country array if needed
        if (!isset($states[$country_code])) {
            $states[$country_code] = array();
        }

        $states[$country_code][$state_code] = $state_name;
        update_option('cartflow_custom_states', $states);
        $this->clear_wc_cache();

        return rest_ensure_response(array(
            'success' => true,
            'is_override' => $is_override,
            'state' => array('country_code' => $country_code, 'state_code' => $state_code, 'state_name' => $state_name),
        ));
    }

    public function delete_custom_state($request) {
        $country_code = strtoupper($request->get_param('country_code'));
        $state_code = $request->get_param('state_code');

        $states = get_option('cartflow_custom_states', array());

        if (!isset($states[$country_code][$state_code])) {
            return new WP_Error('state_not_found', __('State not found.', 'cartflow-bridge'), array('status' => 404));
        }

        unset($states[$country_code][$state_code]);
        if (empty($states[$country_code])) {
            unset($states[$country_code]);
        }

        update_option('cartflow_custom_states', $states);
        $this->clear_wc_cache();

        return rest_ensure_response(array('success' => true, 'message' => __('State deleted.', 'cartflow-bridge')));
    }

    public function bulk_update_states($request) {
        $country_code = strtoupper($request->get_param('country_code'));
        $params = $request->get_json_params();
        $new_states = $params['states'] ?? array();
        $groups = $params['groups'] ?? array();

        // Update states
        $states = get_option('cartflow_custom_states', array());
        if (!isset($states[$country_code])) {
            $states[$country_code] = array();
        }

        // Update state group mappings
        $state_groups = get_option('cartflow_state_group_mappings', array());
        if (!isset($state_groups[$country_code])) {
            $state_groups[$country_code] = array();
        }

        foreach ($new_states as $state) {
            if (isset($state['code']) && isset($state['name'])) {
                $states[$country_code][$state['code']] = $state['name'];

                // Store group mappings if provided
                if (isset($state['groups']) && is_array($state['groups'])) {
                    $state_groups[$country_code][$state['code']] = $state['groups'];
                }
            }
        }

        update_option('cartflow_custom_states', $states);
        update_option('cartflow_state_group_mappings', $state_groups);

        // Update groups if provided
        if (!empty($groups)) {
            $all_groups = get_option('cartflow_state_groups', array());
            $all_groups[$country_code] = $groups;
            update_option('cartflow_state_groups', $all_groups);
        }

        $this->clear_wc_cache();

        return rest_ensure_response(array(
            'success' => true,
            'message' => sprintf(__('%d states updated for %s.', 'cartflow-bridge'), count($new_states), $country_code),
            'groups_synced' => count($groups),
        ));
    }

    // ==================== STATE VISIBILITY ====================

    public function set_state_visibility($request) {
        $country_code = strtoupper($request->get_param('country_code'));
        $state_code = $request->get_param('state_code');
        $params = $request->get_json_params();
        $visible = isset($params['visible']) ? (bool) $params['visible'] : true;

        $hidden = get_option('cartflow_hidden_states', array());

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

        update_option('cartflow_hidden_states', $hidden);
        $this->clear_wc_cache();

        // Verify by reading back from DB (same request, no cache issues)
        wp_cache_delete('cartflow_hidden_states', 'options');
        $saved = get_option('cartflow_hidden_states', array());
        $country_hidden = isset($saved[$country_code]) ? $saved[$country_code] : array();
        $is_hidden = in_array($state_code, $country_hidden);
        $verified = $visible ? !$is_hidden : $is_hidden;

        return rest_ensure_response(array(
            'success' => true,
            'verified' => $verified,
            'message' => $visible
                ? sprintf(__('State %s:%s is now visible in checkout.', 'cartflow-bridge'), $country_code, $state_code)
                : sprintf(__('State %s:%s is now hidden from checkout.', 'cartflow-bridge'), $country_code, $state_code),
            'country_code' => $country_code,
            'state_code' => $state_code,
            'visible' => $visible,
        ));
    }

    public function get_hidden_states($request) {
        return rest_ensure_response(get_option('cartflow_hidden_states', array()));
    }

    // ==================== STATE GROUPS ====================

    public function get_state_groups($request) {
        $country_code = $request->get_param('country_code');
        $groups = get_option('cartflow_state_groups', array());

        if ($country_code) {
            return rest_ensure_response($groups[strtoupper($country_code)] ?? array());
        }

        return rest_ensure_response($groups);
    }

    public function sync_state_groups($request) {
        $params = $request->get_json_params();
        $country_code = strtoupper($params['country_code'] ?? '');
        $groups = $params['groups'] ?? array();

        if (!$country_code) {
            return new WP_Error('missing_params', __('country_code is required.', 'cartflow-bridge'), array('status' => 400));
        }

        $all_groups = get_option('cartflow_state_groups', array());
        $all_groups[$country_code] = $groups;
        update_option('cartflow_state_groups', $all_groups);

        return rest_ensure_response(array(
            'success' => true,
            'message' => sprintf(__('%d groups synced for %s.', 'cartflow-bridge'), count($groups), $country_code),
        ));
    }

    public function get_states_by_group($request) {
        $country_code = strtoupper($request->get_param('country_code'));
        $group_name = $request->get_param('group');

        $state_groups = get_option('cartflow_state_group_mappings', array());
        $country_mappings = $state_groups[$country_code] ?? array();

        // Get all states for the country
        if (!class_exists('WC_Countries')) {
            return new WP_Error('woocommerce_not_active', __('WooCommerce is not active.', 'cartflow-bridge'), array('status' => 400));
        }

        $wc_countries = new WC_Countries();
        $all_states = $wc_countries->get_states($country_code);

        // Build result with group info
        $result = array();
        foreach ($all_states as $code => $name) {
            $state_data = array(
                'code' => $code,
                'name' => $name,
                'groups' => $country_mappings[$code] ?? array(),
            );

            // If filtering by group, only include states in that group
            if ($group_name) {
                if (in_array($group_name, $state_data['groups'])) {
                    $result[] = $state_data;
                }
            } else {
                $result[] = $state_data;
            }
        }

        return rest_ensure_response($result);
    }

    public function get_countries($request) {
        if (!class_exists('WC_Countries')) {
            return new WP_Error('woocommerce_not_active', __('WooCommerce is not active.', 'cartflow-bridge'), array('status' => 400));
        }

        $wc_countries = new WC_Countries();
        $countries = $wc_countries->get_countries();
        $all_states = $wc_countries->get_states();

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

    // ==================== SYSTEM INFO ====================

    public function get_system_info($request) {
        global $wpdb;

        return rest_ensure_response(array(
            'wordpress' => array(
                'version' => get_bloginfo('version'),
                'multisite' => is_multisite(),
                'memory_limit' => WP_MEMORY_LIMIT,
                'debug_mode' => WP_DEBUG,
            ),
            'server' => array(
                'php_version' => phpversion(),
                'mysql_version' => $wpdb->db_version(),
                'max_upload_size' => wp_max_upload_size(),
                'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown',
            ),
            'woocommerce' => class_exists('WooCommerce') ? array(
                'version' => WC()->version,
                'database_version' => get_option('woocommerce_db_version'),
            ) : null,
            'theme' => array(
                'name' => wp_get_theme()->get('Name'),
                'version' => wp_get_theme()->get('Version'),
                'parent_theme' => wp_get_theme()->parent() ? wp_get_theme()->parent()->get('Name') : null,
            ),
        ));
    }

    public function get_plugins($request) {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        $all_plugins = get_plugins();
        $active_plugins = get_option('active_plugins', array());

        $result = array();
        foreach ($all_plugins as $path => $plugin) {
            $result[] = array(
                'name' => $plugin['Name'],
                'version' => $plugin['Version'],
                'author' => $plugin['Author'],
                'active' => in_array($path, $active_plugins),
                'path' => $path,
            );
        }

        return rest_ensure_response($result);
    }

    public function get_themes($request) {
        $themes = wp_get_themes();
        $active_theme = wp_get_theme();

        $result = array();
        foreach ($themes as $slug => $theme) {
            $result[] = array(
                'name' => $theme->get('Name'),
                'version' => $theme->get('Version'),
                'author' => $theme->get('Author'),
                'active' => $slug === $active_theme->get_stylesheet(),
                'slug' => $slug,
            );
        }

        return rest_ensure_response($result);
    }

    // ==================== PLUGIN INFO ====================

    public function get_plugin_info($request) {
        // Get plugin data from the plugin file header
        if (!function_exists('get_plugin_data')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        $plugin_data = get_plugin_data(__FILE__);

        return rest_ensure_response(array(
            'name' => $plugin_data['Name'],
            'version' => $plugin_data['Version'],
            'author' => $plugin_data['Author'],
            'description' => $plugin_data['Description'],
            'plugin_uri' => $plugin_data['PluginURI'],
            'requires_wp' => $plugin_data['RequiresWP'] ?? '5.0',
            'requires_php' => $plugin_data['RequiresPHP'] ?? '7.4',
            'features' => array(
                'smart_shipping' => array(
                    'enabled' => get_option('cartflow_hide_shipping_when_free', 'yes') === 'yes',
                    'description' => 'Automatically hide paid shipping when free shipping is available',
                ),
                'currency_conversion' => array(
                    'enabled' => !empty(get_option('cartflow_currency_features', array())['enabled']),
                    'description' => 'Convert checkout totals to payment gateway currency with configurable margin',
                ),
                'custom_fields' => array(
                    'enabled' => !empty(get_option('cartflow_custom_fieldsets', array())),
                    'count' => count(get_option('cartflow_custom_fieldsets', array())),
                    'description' => 'Custom product fields (text inputs and image swatches) managed from CartFlow dashboard',
                ),
            ),
        ));
    }

    // ==================== CARTFLOW FEATURES ====================

    public function get_shipping_features($request) {
        return rest_ensure_response(array(
            'hide_when_free_available' => get_option('cartflow_hide_shipping_when_free', 'yes') === 'yes',
        ));
    }

    public function update_shipping_features($request) {
        $params = $request->get_json_params();
        $updated = array();

        if (isset($params['hide_when_free_available'])) {
            $value = $params['hide_when_free_available'] ? 'yes' : 'no';
            update_option('cartflow_hide_shipping_when_free', $value);
            $updated['hide_when_free_available'] = $params['hide_when_free_available'];
        }

        return rest_ensure_response(array(
            'success' => true,
            'message' => __('Shipping features updated.', 'cartflow-bridge'),
            'updated' => $updated,
        ));
    }

    // ==================== CURRENCY CONVERSION FEATURES ====================

    public function get_currency_features($request) {
        $defaults = array(
            'enabled' => false,
            'base_currency' => function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD',
            'gateway_currency' => 'USD',
            'margin_percent' => 0,
            'rate_override' => null,
            'cached_rate' => null,
            'cached_rate_time' => null,
        );

        $settings = get_option('cartflow_currency_features', array());
        $settings = wp_parse_args($settings, $defaults);

        // Always reflect the current WooCommerce base currency
        if (function_exists('get_woocommerce_currency')) {
            $settings['base_currency'] = get_woocommerce_currency();
        }

        return rest_ensure_response($settings);
    }

    public function update_currency_features($request) {
        $params = $request->get_json_params();
        $updated = array();

        $current = get_option('cartflow_currency_features', array());

        $allowed_fields = array('enabled', 'gateway_currency', 'margin_percent', 'rate_override');

        foreach ($allowed_fields as $field) {
            if (array_key_exists($field, $params)) {
                $value = $params[$field];

                // Validate specific fields
                if ($field === 'margin_percent') {
                    $value = floatval($value);
                    if ($value < 0 || $value > 50) {
                        return new WP_Error('invalid_margin', __('Margin must be between 0 and 50 percent.', 'cartflow-bridge'), array('status' => 400));
                    }
                }

                if ($field === 'rate_override' && $value !== null) {
                    $value = floatval($value);
                    if ($value <= 0) {
                        return new WP_Error('invalid_rate', __('Rate override must be a positive number.', 'cartflow-bridge'), array('status' => 400));
                    }
                }

                if ($field === 'enabled') {
                    $value = (bool) $value;
                }

                $current[$field] = $value;
                $updated[$field] = $value;
            }
        }

        update_option('cartflow_currency_features', $current);

        return rest_ensure_response(array(
            'success' => true,
            'message' => __('Currency conversion settings updated.', 'cartflow-bridge'),
            'updated' => $updated,
        ));
    }

    /**
     * Fetch exchange rate from external API with transient caching
     */
    private function fetch_exchange_rate($base, $target) {
        $transient_key = 'cartflow_exchange_rate_' . strtoupper($base) . '_' . strtoupper($target);
        $cached = get_transient($transient_key);

        if ($cached !== false) {
            return $cached;
        }

        $url = 'https://open.er-api.com/v6/latest/' . strtoupper($base);
        $response = wp_remote_get($url, array('timeout' => 15));

        if (is_wp_error($response)) {
            return new WP_Error('rate_fetch_failed', __('Failed to fetch exchange rate: ', 'cartflow-bridge') . $response->get_error_message(), array('status' => 502));
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);

        if (empty($body['result']) || $body['result'] !== 'success') {
            return new WP_Error('rate_parse_failed', __('Invalid response from exchange rate API.', 'cartflow-bridge'), array('status' => 502));
        }

        $target_upper = strtoupper($target);
        if (!isset($body['rates'][$target_upper])) {
            return new WP_Error('rate_not_found', sprintf(__('Exchange rate not found for %s.', 'cartflow-bridge'), $target_upper), array('status' => 404));
        }

        $rate = floatval($body['rates'][$target_upper]);

        // Cache for 12 hours
        set_transient($transient_key, $rate, 12 * HOUR_IN_SECONDS);

        // Store in currency settings for reference
        $settings = get_option('cartflow_currency_features', array());
        $settings['cached_rate'] = $rate;
        $settings['cached_rate_time'] = current_time('mysql');
        update_option('cartflow_currency_features', $settings);

        return $rate;
    }

    public function get_live_exchange_rate($request) {
        $settings = get_option('cartflow_currency_features', array());

        $base = $request->get_param('base');
        if (!$base) {
            $base = function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD';
        }

        $target = $request->get_param('target');
        if (!$target) {
            $target = isset($settings['gateway_currency']) ? $settings['gateway_currency'] : 'USD';
        }

        $transient_key = 'cartflow_exchange_rate_' . strtoupper($base) . '_' . strtoupper($target);
        $cached_rate = get_transient($transient_key);
        $is_cached = ($cached_rate !== false);

        $rate = $this->fetch_exchange_rate($base, $target);

        if (is_wp_error($rate)) {
            return $rate;
        }

        return rest_ensure_response(array(
            'base' => strtoupper($base),
            'target' => strtoupper($target),
            'rate' => $rate,
            'cached' => $is_cached,
            'last_updated' => isset($settings['cached_rate_time']) ? $settings['cached_rate_time'] : null,
        ));
    }

    // ==================== CUSTOM FIELDSETS ====================

    /**
     * Sync custom fieldsets from CartFlow backend
     * Receives full fieldsets JSON and stores as WP option
     */
    public function sync_custom_fieldsets($request) {
        $fieldsets = $request->get_param('fieldsets');

        if (!is_array($fieldsets)) {
            return new \WP_Error('invalid_data', __('Fieldsets must be an array', 'cartflow-bridge'), array('status' => 400));
        }

        update_option('cartflow_custom_fieldsets', $fieldsets, true);

        return rest_ensure_response(array(
            'success' => true,
            'message' => sprintf(__('%d fieldset(s) synced successfully', 'cartflow-bridge'), count($fieldsets)),
            'count' => count($fieldsets),
        ));
    }

    /**
     * Get stored custom fieldsets
     */
    public function get_custom_fieldsets($request) {
        $fieldsets = get_option('cartflow_custom_fieldsets', array());
        return rest_ensure_response($fieldsets);
    }

    /**
     * Get applicable fieldsets for a given product ID
     */
    private function get_fieldsets_for_product($product_id) {
        $all_fieldsets = get_option('cartflow_custom_fieldsets', array());
        if (empty($all_fieldsets)) {
            return array();
        }

        // Get product object
        $product = wc_get_product($product_id);
        if (!$product) {
            return array();
        }

        // Get product category IDs
        $product_cat_ids = $product->get_category_ids();

        // Get product tag IDs
        $product_tag_ids = $product->get_tag_ids();

        // Get product type (simple, variable, grouped, external)
        $product_type = $product->get_type();

        // Get product attribute taxonomy IDs (WooCommerce attribute IDs)
        $product_attribute_ids = array();
        $attributes = $product->get_attributes();
        if (!empty($attributes)) {
            foreach ($attributes as $attribute) {
                if (is_a($attribute, 'WC_Product_Attribute') && $attribute->is_taxonomy()) {
                    $product_attribute_ids[] = $attribute->get_id();
                }
            }
        }

        $applicable = array();

        foreach ($all_fieldsets as $fieldset) {
            if (empty($fieldset['status']) || $fieldset['status'] !== 'active') {
                continue;
            }

            $type = isset($fieldset['assignmentType']) ? $fieldset['assignmentType'] : '';

            if ($type === 'all') {
                $applicable[] = $fieldset;
            } elseif ($type === 'product') {
                $product_ext_ids = isset($fieldset['productExternalIds']) ? $fieldset['productExternalIds'] : array();
                if (in_array($product_id, $product_ext_ids)) {
                    $applicable[] = $fieldset;
                }
            } elseif ($type === 'category') {
                $cat_ext_ids = isset($fieldset['categoryExternalIds']) ? $fieldset['categoryExternalIds'] : array();
                if (!empty(array_intersect($product_cat_ids, $cat_ext_ids))) {
                    $applicable[] = $fieldset;
                }
            } elseif ($type === 'tag') {
                $tag_ext_ids = isset($fieldset['tagExternalIds']) ? $fieldset['tagExternalIds'] : array();
                if (!empty(array_intersect($product_tag_ids, $tag_ext_ids))) {
                    $applicable[] = $fieldset;
                }
            } elseif ($type === 'product_type') {
                $types = isset($fieldset['productTypes']) ? $fieldset['productTypes'] : array();
                if (in_array($product_type, $types)) {
                    $applicable[] = $fieldset;
                }
            } elseif ($type === 'attribute') {
                $attr_ext_ids = isset($fieldset['attributeExternalIds']) ? $fieldset['attributeExternalIds'] : array();
                if (!empty(array_intersect($product_attribute_ids, $attr_ext_ids))) {
                    $applicable[] = $fieldset;
                }
            }
        }

        // Sort by position
        usort($applicable, function($a, $b) {
            return ($a['position'] ?? 0) - ($b['position'] ?? 0);
        });

        return $applicable;
    }

    /**
     * Render custom fields on the product page (before add-to-cart button)
     */
    public function render_custom_fields() {
        global $product;
        if (!$product) {
            return;
        }

        $product_id = $product->get_id();
        $fieldsets = $this->get_fieldsets_for_product($product_id);

        if (empty($fieldsets)) {
            return;
        }

        echo '<div class="cartflow-custom-fields">';

        foreach ($fieldsets as $fieldset) {
            $fieldset_name = sanitize_title($fieldset['name'] ?? '');
            $fields = isset($fieldset['fields']) ? $fieldset['fields'] : array();

            // Sort fields by position
            usort($fields, function($a, $b) {
                return ($a['position'] ?? 0) - ($b['position'] ?? 0);
            });

            if (!empty($fieldset['name'])) {
                echo '<div class="cartflow-fieldset" data-fieldset="' . esc_attr($fieldset_name) . '">';
                echo '<h4 class="cartflow-fieldset-title">' . esc_html($fieldset['name']) . '</h4>';
            }

            foreach ($fields as $field) {
                // Skip hidden fields
                if (isset($field['visible']) && $field['visible'] === false) {
                    continue;
                }

                $field_name = sanitize_title($field['name'] ?? '');
                $field_key = 'cartflow_' . $fieldset_name . '_' . $field_name;
                $field_type = isset($field['type']) ? $field['type'] : 'text';
                $field_label = isset($field['label']) ? $field['label'] : $field_name;
                $is_required = !empty($field['required']);
                $required_attr = $is_required ? ' required' : '';
                $required_mark = $is_required ? ' <span class="required">*</span>' : '';

                // Conditional logic data attributes
                $conditions = isset($field['conditions']) ? $field['conditions'] : array();
                $cond_attr = '';
                if (!empty($conditions)) {
                    $cond_attr = ' data-conditions="' . esc_attr(wp_json_encode($conditions)) . '"';
                }

                // Price add-on display
                $price_type = isset($field['priceType']) ? $field['priceType'] : 'none';
                $price_amount = isset($field['priceAmount']) ? floatval($field['priceAmount']) : 0;
                $price_display = '';
                if ($price_type !== 'none' && $price_amount > 0) {
                    $price_display = $price_type === 'percentage'
                        ? ' (+' . $price_amount . '%)'
                        : ' (+' . wc_price($price_amount) . ')';
                }

                echo '<div class="cartflow-field cartflow-field--' . esc_attr($field_type) . '"' . $cond_attr . ' data-field-key="' . esc_attr($field_key) . '" data-field-name="' . esc_attr($field_name) . '">';

                // Demo note & image
                $demo_note = isset($field['demoNote']) ? trim($field['demoNote']) : '';
                $demo_image = isset($field['demoImage']) ? trim($field['demoImage']) : '';

                if ($demo_note || $demo_image) {
                    echo '<div class="cartflow-field-header">';
                    echo '<div class="cartflow-field-header-left">';
                }

                echo '<label for="' . esc_attr($field_key) . '">' . esc_html($field_label) . $price_display . $required_mark . '</label>';

                if ($demo_note) {
                    echo '<p class="cartflow-demo-note">' . esc_html($demo_note) . '</p>';
                }

                if ($demo_note || $demo_image) {
                    echo '</div>'; // close header-left
                    if ($demo_image) {
                        echo '<div class="cartflow-demo-image"><img src="' . esc_url($demo_image) . '" alt="' . esc_attr($field_label) . ' example" class="cartflow-demo-img" data-full="' . esc_url($demo_image) . '" /></div>';
                    }
                    echo '</div>'; // close header
                }

                if ($field_type === 'text') {
                    $placeholder = isset($field['placeholder']) ? $field['placeholder'] : '';
                    echo '<input type="text" id="' . esc_attr($field_key) . '" name="' . esc_attr($field_key) . '" placeholder="' . esc_attr($placeholder) . '"' . $required_attr . ' class="cartflow-text-input" />';
                } elseif ($field_type === 'textarea') {
                    $placeholder = isset($field['placeholder']) ? $field['placeholder'] : '';
                    echo '<textarea id="' . esc_attr($field_key) . '" name="' . esc_attr($field_key) . '" placeholder="' . esc_attr($placeholder) . '"' . $required_attr . ' class="cartflow-textarea" rows="3"></textarea>';
                } elseif ($field_type === 'number') {
                    $placeholder = isset($field['placeholder']) ? $field['placeholder'] : '';
                    $min_attr = isset($field['min']) && $field['min'] !== null ? ' min="' . esc_attr($field['min']) . '"' : '';
                    $max_attr = isset($field['max']) && $field['max'] !== null ? ' max="' . esc_attr($field['max']) . '"' : '';
                    echo '<input type="number" id="' . esc_attr($field_key) . '" name="' . esc_attr($field_key) . '" placeholder="' . esc_attr($placeholder) . '"' . $min_attr . $max_attr . $required_attr . ' class="cartflow-number-input" />';
                } elseif ($field_type === 'checkbox') {
                    $cb_label = isset($field['checkboxLabel']) && $field['checkboxLabel'] ? $field['checkboxLabel'] : $field_label;
                    echo '<label class="cartflow-checkbox-label" for="' . esc_attr($field_key) . '">';
                    echo '<input type="checkbox" id="' . esc_attr($field_key) . '" name="' . esc_attr($field_key) . '" value="yes"' . $required_attr . ' class="cartflow-checkbox" />';
                    echo ' ' . esc_html($cb_label);
                    echo '</label>';
                } elseif ($field_type === 'radio') {
                    $options = isset($field['options']) ? $field['options'] : array();
                    if (!empty($options)) {
                        echo '<div class="cartflow-radio-options">';
                        foreach ($options as $idx => $option) {
                            $opt_value = isset($option['value']) ? $option['value'] : '';
                            $opt_label = isset($option['label']) ? $option['label'] : '';
                            $opt_price_type = isset($option['priceType']) ? $option['priceType'] : 'none';
                            $opt_price_amt = isset($option['priceAmount']) ? floatval($option['priceAmount']) : 0;
                            $opt_unavailable = isset($option['visible']) && $option['visible'] === false;
                            $opt_price_str = '';
                            if ($opt_price_type !== 'none' && $opt_price_amt > 0) {
                                $opt_price_str = $opt_price_type === 'percentage' ? ' (+' . $opt_price_amt . '%)' : ' (+' . wc_price($opt_price_amt) . ')';
                            }
                            $opt_id = $field_key . '_' . $idx;
                            $unavail_class = $opt_unavailable ? ' cartflow-option-unavailable' : '';
                            $disabled_attr = $opt_unavailable ? ' disabled' : '';
                            echo '<label class="cartflow-radio-option' . $unavail_class . '" for="' . esc_attr($opt_id) . '">';
                            echo '<input type="radio" id="' . esc_attr($opt_id) . '" name="' . esc_attr($field_key) . '" value="' . esc_attr($opt_value) . '"' . $required_attr . $disabled_attr . ' class="cartflow-radio" data-price-type="' . esc_attr($opt_price_type) . '" data-price-amount="' . esc_attr($opt_price_amt) . '" />';
                            echo ' ' . esc_html($opt_label) . $opt_price_str;
                            echo '</label>';
                        }
                        echo '</div>';
                    }
                } elseif ($field_type === 'dropdown') {
                    $options = isset($field['options']) ? $field['options'] : array();
                    echo '<select id="' . esc_attr($field_key) . '" name="' . esc_attr($field_key) . '"' . $required_attr . ' class="cartflow-dropdown">';
                    echo '<option value="">' . esc_html__('Select an option...', 'cartflow-bridge') . '</option>';
                    foreach ($options as $option) {
                        $opt_value = isset($option['value']) ? $option['value'] : '';
                        $opt_label = isset($option['label']) ? $option['label'] : '';
                        $opt_price_type = isset($option['priceType']) ? $option['priceType'] : 'none';
                        $opt_price_amt = isset($option['priceAmount']) ? floatval($option['priceAmount']) : 0;
                        $opt_unavailable = isset($option['visible']) && $option['visible'] === false;
                        $opt_price_str = '';
                        if ($opt_price_type !== 'none' && $opt_price_amt > 0) {
                            $opt_price_str = $opt_price_type === 'percentage' ? ' (+' . $opt_price_amt . '%)' : ' (+' . strip_tags(wc_price($opt_price_amt)) . ')';
                        }
                        $disabled_attr = $opt_unavailable ? ' disabled' : '';
                        $unavail_prefix = $opt_unavailable ? '✕ ' : '';
                        echo '<option value="' . esc_attr($opt_value) . '"' . $disabled_attr . ' data-price-type="' . esc_attr($opt_price_type) . '" data-price-amount="' . esc_attr($opt_price_amt) . '">' . $unavail_prefix . esc_html($opt_label) . $opt_price_str . '</option>';
                    }
                    echo '</select>';
                } elseif ($field_type === 'image_swatch') {
                    $options = isset($field['options']) ? $field['options'] : array();
                    if (!empty($options)) {
                        echo '<div class="cartflow-swatch-options" data-field="' . esc_attr($field_key) . '">';
                        foreach ($options as $idx => $option) {
                            $opt_value = isset($option['value']) ? $option['value'] : '';
                            $opt_label = isset($option['label']) ? $option['label'] : '';
                            $opt_image = isset($option['image']) ? $option['image'] : '';
                            $opt_unavailable = isset($option['visible']) && $option['visible'] === false;
                            $opt_id = $field_key . '_' . $idx;
                            $unavail_class = $opt_unavailable ? ' cartflow-option-unavailable' : '';
                            $disabled_attr = $opt_unavailable ? ' disabled' : '';

                            echo '<label class="cartflow-swatch-option' . $unavail_class . '" for="' . esc_attr($opt_id) . '" title="' . esc_attr($opt_label) . '">';
                            echo '<input type="radio" id="' . esc_attr($opt_id) . '" name="' . esc_attr($field_key) . '" value="' . esc_attr($opt_value) . '"' . $required_attr . $disabled_attr . ' class="cartflow-swatch-radio" />';
                            if ($opt_image) {
                                echo '<img src="' . esc_url($opt_image) . '" alt="' . esc_attr($opt_label) . '" class="cartflow-swatch-image" />';
                            }
                            echo '<span class="cartflow-swatch-label">' . esc_html($opt_label) . '</span>';
                            echo '</label>';
                        }
                        echo '</div>';
                    }
                } elseif ($field_type === 'color_picker') {
                    $default_color = isset($field['defaultColor']) ? $field['defaultColor'] : '#000000';
                    echo '<input type="color" id="' . esc_attr($field_key) . '" name="' . esc_attr($field_key) . '" value="' . esc_attr($default_color) . '"' . $required_attr . ' class="cartflow-color-picker" />';
                } elseif ($field_type === 'date_picker') {
                    $min_date = isset($field['minDate']) && $field['minDate'] ? ' min="' . esc_attr($field['minDate']) . '"' : '';
                    $max_date = isset($field['maxDate']) && $field['maxDate'] ? ' max="' . esc_attr($field['maxDate']) . '"' : '';
                    echo '<input type="date" id="' . esc_attr($field_key) . '" name="' . esc_attr($field_key) . '"' . $min_date . $max_date . $required_attr . ' class="cartflow-date-picker" />';
                } elseif ($field_type === 'file_upload') {
                    $allowed_types = isset($field['allowedFileTypes']) && $field['allowedFileTypes'] ? $field['allowedFileTypes'] : '';
                    $max_size = isset($field['maxFileSize']) ? intval($field['maxFileSize']) : 5;
                    $accept_attr = '';
                    if ($allowed_types) {
                        $exts = array_map(function($e) { return '.' . trim($e); }, explode(',', $allowed_types));
                        $accept_attr = ' accept="' . esc_attr(implode(',', $exts)) . '"';
                    }
                    echo '<input type="file" id="' . esc_attr($field_key) . '" name="' . esc_attr($field_key) . '"' . $accept_attr . $required_attr . ' class="cartflow-file-upload" data-max-size="' . esc_attr($max_size) . '" />';
                    if ($allowed_types) {
                        echo '<small class="cartflow-file-hint">' . esc_html__('Allowed: ', 'cartflow-bridge') . esc_html($allowed_types) . ' (max ' . esc_html($max_size) . 'MB)</small>';
                    }
                } elseif ($field_type === 'compound') {
                    $parent_type = isset($field['parentType']) ? $field['parentType'] : 'radio';
                    $child_type = isset($field['childType']) ? $field['childType'] : 'radio';
                    $parent_label_text = isset($field['parentLabel']) ? $field['parentLabel'] : 'Parent';
                    $child_label_text = isset($field['childLabel']) ? $field['childLabel'] : 'Child';
                    $options = isset($field['options']) ? $field['options'] : array();
                    $child_key = $field_key . '_child';

                    // Build children map with visible flag preserved for JS
                    $children_map = array();
                    foreach ($options as $opt) {
                        $pv = isset($opt['value']) ? $opt['value'] : '';
                        $children_map[$pv] = isset($opt['children']) ? $opt['children'] : array();
                    }

                    echo '<div class="cartflow-compound-wrapper" data-children-map="' . esc_attr(wp_json_encode($children_map)) . '" data-child-type="' . esc_attr($child_type) . '" data-child-key="' . esc_attr($child_key) . '" data-child-label="' . esc_attr($child_label_text) . '">';

                    // Parent selector
                    echo '<div class="cartflow-compound-parent-section">';
                    echo '<span class="cartflow-compound-section-label">' . esc_html($parent_label_text) . '</span>';

                    if ($parent_type === 'radio') {
                        echo '<div class="cartflow-radio-options">';
                        foreach ($options as $idx => $option) {
                            $opt_value = isset($option['value']) ? $option['value'] : '';
                            $opt_label = isset($option['label']) ? $option['label'] : '';
                            $opt_price_type = isset($option['priceType']) ? $option['priceType'] : 'none';
                            $opt_price_amt = isset($option['priceAmount']) ? floatval($option['priceAmount']) : 0;
                            $opt_unavailable = isset($option['visible']) && $option['visible'] === false;
                            $opt_price_str = '';
                            if ($opt_price_type !== 'none' && $opt_price_amt > 0) {
                                $opt_price_str = $opt_price_type === 'percentage' ? ' (+' . $opt_price_amt . '%)' : ' (+' . wc_price($opt_price_amt) . ')';
                            }
                            $opt_id = $field_key . '_' . $idx;
                            $unavail_class = $opt_unavailable ? ' cartflow-option-unavailable' : '';
                            $disabled_attr = $opt_unavailable ? ' disabled' : '';
                            echo '<label class="cartflow-radio-option' . $unavail_class . '" for="' . esc_attr($opt_id) . '">';
                            echo '<input type="radio" id="' . esc_attr($opt_id) . '" name="' . esc_attr($field_key) . '" value="' . esc_attr($opt_value) . '"' . $required_attr . $disabled_attr . ' class="cartflow-radio cartflow-compound-parent-input" data-price-type="' . esc_attr($opt_price_type) . '" data-price-amount="' . esc_attr($opt_price_amt) . '" />';
                            echo ' ' . esc_html($opt_label) . $opt_price_str;
                            echo '</label>';
                        }
                        echo '</div>';
                    } elseif ($parent_type === 'dropdown') {
                        echo '<select id="' . esc_attr($field_key) . '" name="' . esc_attr($field_key) . '"' . $required_attr . ' class="cartflow-dropdown cartflow-compound-parent-input">';
                        echo '<option value="">' . esc_html(sprintf(__('Select %s...', 'cartflow-bridge'), $parent_label_text)) . '</option>';
                        foreach ($options as $option) {
                            $opt_value = isset($option['value']) ? $option['value'] : '';
                            $opt_label = isset($option['label']) ? $option['label'] : '';
                            $opt_price_type = isset($option['priceType']) ? $option['priceType'] : 'none';
                            $opt_price_amt = isset($option['priceAmount']) ? floatval($option['priceAmount']) : 0;
                            $opt_unavailable = isset($option['visible']) && $option['visible'] === false;
                            $opt_price_str = '';
                            if ($opt_price_type !== 'none' && $opt_price_amt > 0) {
                                $opt_price_str = $opt_price_type === 'percentage' ? ' (+' . $opt_price_amt . '%)' : ' (+' . strip_tags(wc_price($opt_price_amt)) . ')';
                            }
                            $disabled_attr = $opt_unavailable ? ' disabled' : '';
                            $unavail_prefix = $opt_unavailable ? '✕ ' : '';
                            echo '<option value="' . esc_attr($opt_value) . '"' . $disabled_attr . ' data-price-type="' . esc_attr($opt_price_type) . '" data-price-amount="' . esc_attr($opt_price_amt) . '">' . $unavail_prefix . esc_html($opt_label) . $opt_price_str . '</option>';
                        }
                        echo '</select>';
                    } elseif ($parent_type === 'image_swatch') {
                        echo '<div class="cartflow-swatch-options" data-field="' . esc_attr($field_key) . '">';
                        foreach ($options as $idx => $option) {
                            $opt_value = isset($option['value']) ? $option['value'] : '';
                            $opt_label = isset($option['label']) ? $option['label'] : '';
                            $opt_image = isset($option['image']) ? $option['image'] : '';
                            $opt_unavailable = isset($option['visible']) && $option['visible'] === false;
                            $opt_id = $field_key . '_' . $idx;
                            $unavail_class = $opt_unavailable ? ' cartflow-option-unavailable' : '';
                            $disabled_attr = $opt_unavailable ? ' disabled' : '';
                            echo '<label class="cartflow-swatch-option' . $unavail_class . '" for="' . esc_attr($opt_id) . '" title="' . esc_attr($opt_label) . '">';
                            echo '<input type="radio" id="' . esc_attr($opt_id) . '" name="' . esc_attr($field_key) . '" value="' . esc_attr($opt_value) . '"' . $required_attr . $disabled_attr . ' class="cartflow-swatch-radio cartflow-compound-parent-input" />';
                            if ($opt_image) {
                                echo '<img src="' . esc_url($opt_image) . '" alt="' . esc_attr($opt_label) . '" class="cartflow-swatch-image" />';
                            }
                            echo '<span class="cartflow-swatch-label">' . esc_html($opt_label) . '</span>';
                            echo '</label>';
                        }
                        echo '</div>';
                    }
                    echo '</div>'; // close parent section

                    // Child container (initially disabled)
                    echo '<div class="cartflow-compound-child-container cartflow-compound-disabled">';
                    echo '<span class="cartflow-compound-section-label">' . esc_html($child_label_text) . '</span>';
                    echo '<div class="cartflow-compound-child-options">';
                    echo '<p class="cartflow-compound-child-placeholder">' . esc_html(sprintf(__('Select a %s first', 'cartflow-bridge'), strtolower($parent_label_text))) . '</p>';
                    echo '</div>';
                    echo '</div>'; // close child container

                    echo '</div>'; // close compound wrapper
                }

                echo '</div>';
            }

            if (!empty($fieldset['name'])) {
                echo '</div>';
            }
        }

        echo '</div>';

        // Inline CSS and JS for custom fields
        $this->render_custom_fields_styles();
    }

    /**
     * Render inline CSS and JS for custom fields
     */
    private function render_custom_fields_styles() {
        ?>
        <style>
            .cartflow-custom-fields {
                margin: 15px 0;
            }
            .cartflow-fieldset {
                margin-bottom: 15px;
            }
            .cartflow-fieldset-title {
                margin: 0 0 10px 0;
                font-size: 1em;
                font-weight: 600;
            }
            .cartflow-field {
                margin-bottom: 12px;
            }
            .cartflow-field label {
                display: block;
                margin-bottom: 5px;
                font-weight: 500;
                font-size: 0.9em;
            }
            .cartflow-field-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: clamp(8px, 2vw, 16px);
            }
            .cartflow-field-header-left {
                flex: 1;
                min-width: 0;
            }
            .cartflow-demo-note {
                margin: 2px 0 6px 0;
                font-size: 0.82em;
                color: #666;
                font-style: italic;
            }
            .cartflow-demo-image {
                flex-shrink: 0;
                align-self: center;
            }
            .cartflow-demo-img {
                width: clamp(48px, 8vw, 96px);
                height: auto;
                aspect-ratio: 4 / 3;
                object-fit: cover;
                border-radius: 6px;
                border: 1px solid rgba(0, 0, 0, 0.08);
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
                cursor: pointer;
                transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
            }
            .cartflow-demo-img:hover {
                opacity: 0.9;
                transform: scale(1.04);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
            }
            .cartflow-lightbox {
                position: fixed;
                inset: 0;
                z-index: 999999;
                background: rgba(0,0,0,0.85);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                backdrop-filter: blur(4px);
                -webkit-backdrop-filter: blur(4px);
            }
            .cartflow-lightbox img {
                max-width: 90vw;
                max-height: 90vh;
                object-fit: contain;
                border-radius: 8px;
            }
            .cartflow-field .required {
                color: #e00;
            }
            .cartflow-text-input,
            .cartflow-textarea,
            .cartflow-number-input,
            .cartflow-dropdown {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 0.95em;
                box-sizing: border-box;
            }
            .cartflow-textarea {
                resize: vertical;
                min-height: 60px;
            }
            .cartflow-number-input {
                max-width: 200px;
            }
            .cartflow-text-input:focus,
            .cartflow-textarea:focus,
            .cartflow-number-input:focus,
            .cartflow-dropdown:focus {
                border-color: #3b82f6;
                outline: none;
                box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
            }
            .cartflow-checkbox-label {
                display: flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
                font-size: 0.95em;
            }
            .cartflow-checkbox {
                width: 16px;
                height: 16px;
                cursor: pointer;
            }
            .cartflow-radio-options {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .cartflow-radio-option {
                display: flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
                font-size: 0.95em;
            }
            .cartflow-radio {
                width: 16px;
                height: 16px;
                cursor: pointer;
            }
            .cartflow-swatch-options {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .cartflow-swatch-option {
                position: relative;
                display: inline-flex;
                flex-direction: column;
                align-items: center;
                cursor: pointer;
                border: 2px solid #ddd;
                border-radius: 6px;
                padding: 6px;
                transition: border-color 0.2s, box-shadow 0.2s;
                max-width: 80px;
                text-align: center;
            }
            .cartflow-swatch-option:hover {
                border-color: #999;
            }
            .cartflow-swatch-option.selected {
                border-color: #3b82f6;
                box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
            }
            .cartflow-swatch-radio {
                position: absolute;
                opacity: 0;
                width: 0;
                height: 0;
            }
            .cartflow-swatch-image {
                width: 60px;
                height: 60px;
                object-fit: cover;
                border-radius: 4px;
            }
            .cartflow-swatch-label {
                display: block;
                font-size: 0.75em;
                margin-top: 4px;
                line-height: 1.2;
                word-break: break-word;
            }
            @media (max-width: 480px) {
                .cartflow-field-header {
                    gap: 6px;
                }
                .cartflow-demo-img {
                    width: 40px;
                    border-radius: 4px;
                }
                .cartflow-swatch-options {
                    gap: 4px;
                }
                .cartflow-swatch-option {
                    padding: 3px;
                    max-width: calc((100% - 16px) / 5);
                    box-sizing: border-box;
                }
                .cartflow-swatch-image {
                    width: 100%;
                    height: auto;
                    aspect-ratio: 1;
                }
                .cartflow-swatch-label {
                    font-size: 0.65em;
                    margin-top: 2px;
                }
            }
            .cartflow-color-picker {
                width: 60px;
                height: 40px;
                padding: 2px;
                border: 1px solid #ddd;
                border-radius: 4px;
                cursor: pointer;
            }
            .cartflow-date-picker {
                width: 100%;
                max-width: 250px;
                padding: 8px 12px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 0.95em;
                box-sizing: border-box;
            }
            .cartflow-date-picker:focus {
                border-color: #3b82f6;
                outline: none;
                box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
            }
            .cartflow-file-upload {
                width: 100%;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 0.9em;
                box-sizing: border-box;
            }
            .cartflow-file-hint {
                display: block;
                margin-top: 4px;
                color: #888;
                font-size: 0.8em;
            }
            .cartflow-field[data-conditions]:not([data-conditions="[]"]).cartflow-hidden {
                display: none;
            }
            /* Unavailable option styles (visible but not selectable) */
            .cartflow-option-unavailable {
                opacity: 0.45;
                pointer-events: none;
                position: relative;
                text-decoration: line-through;
                text-decoration-color: #c00;
            }
            .cartflow-swatch-option.cartflow-option-unavailable::after {
                content: '';
                position: absolute;
                inset: 0;
                background: linear-gradient(135deg, transparent 45%, #c00 45%, #c00 55%, transparent 55%);
                opacity: 0.35;
                border-radius: 6px;
                pointer-events: none;
            }
            .cartflow-swatch-option.cartflow-option-unavailable {
                text-decoration: none;
            }
            /* Compound field styles */
            .cartflow-compound-wrapper {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .cartflow-compound-section-label {
                display: block;
                margin-bottom: 5px;
                font-weight: 500;
                font-size: 0.88em;
                color: #444;
            }
            .cartflow-compound-disabled {
                opacity: 0.4;
                pointer-events: none;
            }
            .cartflow-compound-child-container {
                transition: opacity 0.2s ease;
            }
            .cartflow-compound-child-placeholder {
                font-size: 0.85em;
                color: #999;
                font-style: italic;
                margin: 0;
            }
        </style>
        <script>
            (function() {
                /* Demo image lightbox */
                document.addEventListener('click', function(e) {
                    if (e.target.classList.contains('cartflow-demo-img')) {
                        var src = e.target.getAttribute('data-full');
                        if (!src) return;
                        var overlay = document.createElement('div');
                        overlay.className = 'cartflow-lightbox';
                        overlay.innerHTML = '<img src="' + src + '" alt="Demo image" />';
                        overlay.addEventListener('click', function() {
                            overlay.remove();
                        });
                        document.body.appendChild(overlay);
                    }
                });

                /* Swatch selection */
                document.addEventListener('change', function(e) {
                    if (e.target.classList.contains('cartflow-swatch-radio')) {
                        var container = e.target.closest('.cartflow-swatch-options');
                        if (container) {
                            container.querySelectorAll('.cartflow-swatch-option').forEach(function(opt) {
                                opt.classList.remove('selected');
                            });
                            e.target.closest('.cartflow-swatch-option').classList.add('selected');
                        }
                    }
                });

                /* File upload validation */
                document.addEventListener('change', function(e) {
                    if (e.target.classList.contains('cartflow-file-upload')) {
                        var maxSize = parseInt(e.target.getAttribute('data-max-size') || '5', 10);
                        var file = e.target.files[0];
                        if (file && file.size > maxSize * 1024 * 1024) {
                            alert('File is too large. Maximum size is ' + maxSize + 'MB.');
                            e.target.value = '';
                        }
                    }
                });

                /* Compound field: parent change → rebuild child options */
                function handleCompoundParentChange(e) {
                    var input = e.target;
                    if (!input.classList.contains('cartflow-compound-parent-input')) return;

                    var wrapper = input.closest('.cartflow-compound-wrapper');
                    if (!wrapper) return;

                    var childrenMapStr = wrapper.getAttribute('data-children-map');
                    var childType = wrapper.getAttribute('data-child-type') || 'radio';
                    var childKey = wrapper.getAttribute('data-child-key') || '';
                    var childLabel = wrapper.getAttribute('data-child-label') || 'Child';

                    var selectedValue = '';
                    if (input.tagName === 'SELECT') {
                        selectedValue = input.value;
                    } else if (input.type === 'radio' && input.checked) {
                        selectedValue = input.value;
                    }

                    if (!selectedValue) return;

                    var childrenMap = {};
                    try { childrenMap = JSON.parse(childrenMapStr); } catch(ex) { return; }

                    var children = childrenMap[selectedValue] || [];
                    var container = wrapper.querySelector('.cartflow-compound-child-container');
                    var optionsDiv = container.querySelector('.cartflow-compound-child-options');

                    // Remove disabled state
                    container.classList.remove('cartflow-compound-disabled');

                    if (children.length === 0) {
                        optionsDiv.innerHTML = '<p class="cartflow-compound-child-placeholder">No options available</p>';
                        return;
                    }

                    var html = '';
                    if (childType === 'radio') {
                        html += '<div class="cartflow-radio-options">';
                        children.forEach(function(ch, idx) {
                            var isUnavail = (ch.visible === false);
                            var priceStr = '';
                            if (ch.priceType && ch.priceType !== 'none' && ch.priceAmount > 0) {
                                priceStr = ch.priceType === 'percentage' ? ' (+' + ch.priceAmount + '%)' : ' (+$' + parseFloat(ch.priceAmount).toFixed(2) + ')';
                            }
                            var cid = childKey + '_' + idx;
                            var unavailClass = isUnavail ? ' cartflow-option-unavailable' : '';
                            var disabledAttr = isUnavail ? ' disabled' : '';
                            html += '<label class="cartflow-radio-option' + unavailClass + '" for="' + cid + '">';
                            html += '<input type="radio" id="' + cid + '" name="' + childKey + '" value="' + ch.value + '"' + disabledAttr + ' class="cartflow-radio" data-price-type="' + (ch.priceType || 'none') + '" data-price-amount="' + (ch.priceAmount || 0) + '" />';
                            html += ' ' + ch.label + priceStr;
                            html += '</label>';
                        });
                        html += '</div>';
                    } else if (childType === 'dropdown') {
                        html += '<select name="' + childKey + '" class="cartflow-dropdown">';
                        html += '<option value="">Select ' + childLabel + '...</option>';
                        children.forEach(function(ch) {
                            var isUnavail = (ch.visible === false);
                            var priceStr = '';
                            if (ch.priceType && ch.priceType !== 'none' && ch.priceAmount > 0) {
                                priceStr = ch.priceType === 'percentage' ? ' (+' + ch.priceAmount + '%)' : ' (+$' + parseFloat(ch.priceAmount).toFixed(2) + ')';
                            }
                            var disabledAttr = isUnavail ? ' disabled' : '';
                            var prefix = isUnavail ? '\u2715 ' : '';
                            html += '<option value="' + ch.value + '"' + disabledAttr + ' data-price-type="' + (ch.priceType || 'none') + '" data-price-amount="' + (ch.priceAmount || 0) + '">' + prefix + ch.label + priceStr + '</option>';
                        });
                        html += '</select>';
                    } else if (childType === 'image_swatch') {
                        html += '<div class="cartflow-swatch-options" data-field="' + childKey + '">';
                        children.forEach(function(ch, idx) {
                            var isUnavail = (ch.visible === false);
                            var cid = childKey + '_' + idx;
                            var unavailClass = isUnavail ? ' cartflow-option-unavailable' : '';
                            var disabledAttr = isUnavail ? ' disabled' : '';
                            html += '<label class="cartflow-swatch-option' + unavailClass + '" for="' + cid + '" title="' + ch.label + '">';
                            html += '<input type="radio" id="' + cid + '" name="' + childKey + '" value="' + ch.value + '"' + disabledAttr + ' class="cartflow-swatch-radio" />';
                            if (ch.image) {
                                html += '<img src="' + ch.image + '" alt="' + ch.label + '" class="cartflow-swatch-image" />';
                            }
                            html += '<span class="cartflow-swatch-label">' + ch.label + '</span>';
                            html += '</label>';
                        });
                        html += '</div>';
                    }

                    optionsDiv.innerHTML = html;
                }

                document.addEventListener('change', handleCompoundParentChange);

                /* Conditional logic */
                function evaluateConditions() {
                    var fields = document.querySelectorAll('.cartflow-field[data-conditions]');
                    fields.forEach(function(fieldEl) {
                        var condStr = fieldEl.getAttribute('data-conditions');
                        if (!condStr || condStr === '[]') return;
                        try {
                            var conditions = JSON.parse(condStr);
                            if (!conditions.length) return;
                            var fieldsetEl = fieldEl.closest('.cartflow-fieldset') || fieldEl.closest('.cartflow-custom-fields');
                            var allMet = conditions.every(function(cond) {
                                /* Check if condition targets a compound child (fieldName ends with _child) */
                                var isChildCondition = false;
                                var rawName = cond.fieldName;
                                if (rawName.match(/_child$/)) {
                                    isChildCondition = true;
                                    rawName = rawName.replace(/_child$/, '');
                                }
                                /* Find target field by data-field-name within the same fieldset/container */
                                var condName = rawName.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
                                var scope = fieldsetEl || document;
                                var targetDiv = scope.querySelector('.cartflow-field[data-field-name="' + condName + '"]');
                                if (!targetDiv) return false;
                                var val = '';
                                if (isChildCondition) {
                                    /* For compound child, find input inside the child container */
                                    var childContainer = targetDiv.querySelector('.cartflow-compound-child-container');
                                    if (!childContainer) return false;
                                    var childEl = childContainer.querySelector('input:checked, select');
                                    if (!childEl) return false;
                                    if (childEl.tagName === 'SELECT') {
                                        val = childEl.value || '';
                                    } else {
                                        val = childEl.value || '';
                                    }
                                } else {
                                    var targetEl = targetDiv.querySelector('input, select, textarea');
                                    if (!targetEl) return false;
                                    if (targetEl.type === 'checkbox') {
                                        val = targetEl.checked ? 'yes' : '';
                                    } else if (targetEl.type === 'radio') {
                                        var checked = document.querySelector('[name="' + targetEl.name + '"]:checked');
                                        val = checked ? checked.value : '';
                                    } else {
                                        val = targetEl.value || '';
                                    }
                                }
                                switch (cond.operator) {
                                    case 'equals': return val === cond.value;
                                    case 'not_equals': return val !== cond.value;
                                    case 'contains': return val.indexOf(cond.value) !== -1;
                                    case 'is_empty': return !val;
                                    case 'is_not_empty': return !!val;
                                    default: return true;
                                }
                            });
                            if (allMet) {
                                fieldEl.classList.remove('cartflow-hidden');
                            } else {
                                fieldEl.classList.add('cartflow-hidden');
                                /* Clear hidden field value so it's not submitted */
                                var input = fieldEl.querySelector('input, select, textarea');
                                if (input && input.type !== 'hidden') {
                                    if (input.type === 'checkbox') input.checked = false;
                                    else if (input.type === 'radio') {
                                        fieldEl.querySelectorAll('input[type=radio]').forEach(function(r) { r.checked = false; });
                                    } else input.value = '';
                                }
                            }
                        } catch(ex) {}
                    });
                }

                /* Run on load and on any input change */
                document.addEventListener('DOMContentLoaded', evaluateConditions);
                document.addEventListener('change', function(e) {
                    if (e.target.closest('.cartflow-custom-fields')) {
                        evaluateConditions();
                    }
                });
                document.addEventListener('input', function(e) {
                    if (e.target.closest('.cartflow-custom-fields')) {
                        evaluateConditions();
                    }
                });
            })();
        </script>
        <?php
    }

    /**
     * Validate required custom fields before adding to cart
     */
    public function validate_custom_fields($passed, $product_id, $quantity) {
        $fieldsets = $this->get_fieldsets_for_product($product_id);

        foreach ($fieldsets as $fieldset) {
            $fieldset_name = sanitize_title($fieldset['name'] ?? '');
            $fields = isset($fieldset['fields']) ? $fieldset['fields'] : array();

            foreach ($fields as $field) {
                // Skip hidden fields
                if (isset($field['visible']) && $field['visible'] === false) {
                    continue;
                }

                if (empty($field['required'])) {
                    continue;
                }

                // Skip validation if field is conditionally hidden
                if ($this->is_field_hidden_by_conditions($field, $fieldset_name, $fields)) {
                    continue;
                }

                $field_name = sanitize_title($field['name'] ?? '');
                $field_key = 'cartflow_' . $fieldset_name . '_' . $field_name;
                $field_type = isset($field['type']) ? $field['type'] : 'text';
                $value = isset($_POST[$field_key]) ? sanitize_text_field($_POST[$field_key]) : '';

                if (empty($value)) {
                    $label = isset($field['label']) ? $field['label'] : $field_name;
                    wc_add_notice(
                        sprintf(__('"%s" is a required field.', 'cartflow-bridge'), $label),
                        'error'
                    );
                    $passed = false;
                }

                // Compound field: also validate child when parent is selected and has children
                if ($field_type === 'compound' && !empty($value)) {
                    $child_key = $field_key . '_child';
                    $child_value = isset($_POST[$child_key]) ? sanitize_text_field($_POST[$child_key]) : '';
                    $options = isset($field['options']) ? $field['options'] : array();
                    $has_children = false;
                    foreach ($options as $opt) {
                        if (isset($opt['value']) && $opt['value'] === $value) {
                            $has_children = !empty($opt['children']);
                            break;
                        }
                    }
                    if ($has_children && empty($child_value)) {
                        $child_label_text = isset($field['childLabel']) ? $field['childLabel'] : 'Child option';
                        wc_add_notice(
                            sprintf(__('"%s" is a required field.', 'cartflow-bridge'), $child_label_text),
                            'error'
                        );
                        $passed = false;
                    }
                }
            }
        }

        return $passed;
    }

    /**
     * Check if a field should be hidden based on its conditional logic
     */
    private function is_field_hidden_by_conditions($field, $fieldset_name, $all_fields) {
        $conditions = isset($field['conditions']) ? $field['conditions'] : array();
        if (empty($conditions)) {
            return false;
        }

        foreach ($conditions as $cond) {
            $cond_field_name = sanitize_title($cond['fieldName'] ?? '');
            $cond_key = 'cartflow_' . $fieldset_name . '_' . $cond_field_name;
            $submitted_value = isset($_POST[$cond_key]) ? sanitize_text_field($_POST[$cond_key]) : '';
            $expected_value = isset($cond['value']) ? $cond['value'] : '';
            $operator = isset($cond['operator']) ? $cond['operator'] : 'equals';

            $met = false;
            switch ($operator) {
                case 'equals':
                    $met = ($submitted_value === $expected_value);
                    break;
                case 'not_equals':
                    $met = ($submitted_value !== $expected_value);
                    break;
                case 'contains':
                    $met = (strpos($submitted_value, $expected_value) !== false);
                    break;
                case 'not_empty':
                    $met = !empty($submitted_value);
                    break;
                case 'empty':
                    $met = empty($submitted_value);
                    break;
                default:
                    $met = ($submitted_value === $expected_value);
            }

            // If any condition is NOT met, the field is hidden
            if (!$met) {
                return true;
            }
        }

        return false;
    }

    /**
     * Add custom field values to cart item data
     */
    public function add_custom_fields_to_cart($cart_item_data, $product_id, $variation_id) {
        $fieldsets = $this->get_fieldsets_for_product($product_id);
        $custom_data = array();

        foreach ($fieldsets as $fieldset) {
            $fieldset_name = sanitize_title($fieldset['name'] ?? '');
            $fields = isset($fieldset['fields']) ? $fieldset['fields'] : array();

            foreach ($fields as $field) {
                // Skip hidden fields
                if (isset($field['visible']) && $field['visible'] === false) {
                    continue;
                }

                $field_name = sanitize_title($field['name'] ?? '');
                $field_key = 'cartflow_' . $fieldset_name . '_' . $field_name;
                $value = isset($_POST[$field_key]) ? sanitize_text_field($_POST[$field_key]) : '';

                $field_type = isset($field['type']) ? $field['type'] : '';

                if (!empty($value)) {
                    // Compound fields: store parent and child as two separate entries
                    if ($field_type === 'compound') {
                        $options = isset($field['options']) ? $field['options'] : array();
                        $parent_price_type = 'none';
                        $parent_price_amount = 0;
                        $matched_children = array();

                        foreach ($options as $opt) {
                            if (isset($opt['value']) && $opt['value'] === $value) {
                                $parent_price_type = isset($opt['priceType']) ? $opt['priceType'] : 'none';
                                $parent_price_amount = isset($opt['priceAmount']) ? floatval($opt['priceAmount']) : 0;
                                $matched_children = isset($opt['children']) ? $opt['children'] : array();
                                break;
                            }
                        }

                        $parent_label_text = isset($field['parentLabel']) ? $field['parentLabel'] : (isset($field['label']) ? $field['label'] : $field_name);
                        $custom_data[$field_key] = array(
                            'label' => $parent_label_text,
                            'value' => $value,
                            'fieldset' => isset($fieldset['name']) ? $fieldset['name'] : '',
                            'price_type' => $parent_price_type,
                            'price_amount' => $parent_price_amount,
                        );

                        // Child entry
                        $child_key = $field_key . '_child';
                        $child_value = isset($_POST[$child_key]) ? sanitize_text_field($_POST[$child_key]) : '';
                        if (!empty($child_value)) {
                            $child_price_type = 'none';
                            $child_price_amount = 0;
                            foreach ($matched_children as $ch) {
                                if (isset($ch['value']) && $ch['value'] === $child_value) {
                                    $child_price_type = isset($ch['priceType']) ? $ch['priceType'] : 'none';
                                    $child_price_amount = isset($ch['priceAmount']) ? floatval($ch['priceAmount']) : 0;
                                    break;
                                }
                            }
                            $child_label_text = isset($field['childLabel']) ? $field['childLabel'] : 'Child';
                            $custom_data[$child_key] = array(
                                'label' => $child_label_text,
                                'value' => $child_value,
                                'fieldset' => isset($fieldset['name']) ? $fieldset['name'] : '',
                                'price_type' => $child_price_type,
                                'price_amount' => $child_price_amount,
                            );
                        }

                        continue;
                    }

                    $field_price_type = isset($field['priceType']) ? $field['priceType'] : 'none';
                    $field_price_amount = isset($field['priceAmount']) ? floatval($field['priceAmount']) : 0;

                    // For option-based fields, get selected option's price
                    $option_types = array('radio', 'dropdown', 'image_swatch');
                    if (in_array($field_type, $option_types)) {
                        $options = isset($field['options']) ? $field['options'] : array();
                        foreach ($options as $opt) {
                            if (isset($opt['value']) && $opt['value'] === $value) {
                                $opt_pt = isset($opt['priceType']) ? $opt['priceType'] : 'none';
                                $opt_pa = isset($opt['priceAmount']) ? floatval($opt['priceAmount']) : 0;
                                if ($opt_pt !== 'none' && $opt_pa > 0) {
                                    $field_price_type = $opt_pt;
                                    $field_price_amount = $opt_pa;
                                }
                                break;
                            }
                        }
                    }

                    $custom_data[$field_key] = array(
                        'label' => isset($field['label']) ? $field['label'] : $field_name,
                        'value' => $value,
                        'fieldset' => isset($fieldset['name']) ? $fieldset['name'] : '',
                        'price_type' => $field_price_type,
                        'price_amount' => $field_price_amount,
                    );
                }
            }
        }

        if (!empty($custom_data)) {
            $cart_item_data['cartflow_custom_fields'] = $custom_data;
        }

        return $cart_item_data;
    }

    /**
     * Display custom field values in cart and checkout
     */
    public function display_custom_fields_in_cart($item_data, $cart_item) {
        if (isset($cart_item['cartflow_custom_fields'])) {
            foreach ($cart_item['cartflow_custom_fields'] as $field_data) {
                $item_data[] = array(
                    'key' => $field_data['label'],
                    'value' => $field_data['value'],
                );
            }
        }
        return $item_data;
    }

    /**
     * Save custom field values as order item meta
     */
    public function save_custom_fields_to_order($item, $cart_item_key, $values, $order) {
        if (isset($values['cartflow_custom_fields'])) {
            foreach ($values['cartflow_custom_fields'] as $field_key => $field_data) {
                $meta_key = '_' . $field_key;
                $item->add_meta_data($meta_key, $field_data['value'], true);
            }
        }
    }

    /**
     * Clean up custom field meta key display in order admin/emails
     */
    public function clean_custom_field_meta_key($display_key, $meta, $item) {
        if (strpos($display_key, '_cartflow_') === 0) {
            // Remove prefix and convert to readable label
            $clean = str_replace('_cartflow_', '', $display_key);
            $parts = explode('_', $clean, 2);
            if (count($parts) === 2) {
                // Format: fieldset-name_field-name → Field Name
                $display_key = ucwords(str_replace('-', ' ', $parts[1]));
            } else {
                $display_key = ucwords(str_replace(array('-', '_'), ' ', $clean));
            }
        }
        return $display_key;
    }

    /**
     * Apply custom field price add-ons to cart item prices
     */
    public function apply_custom_field_prices($cart) {
        if (is_admin() && !defined('DOING_AJAX')) return;
        if (did_action('woocommerce_before_calculate_totals') >= 2) return;

        foreach ($cart->get_cart() as $cart_item) {
            if (!isset($cart_item['cartflow_custom_fields'])) continue;

            $extra_price = 0;
            $base_price = floatval($cart_item['data']->get_price());

            foreach ($cart_item['cartflow_custom_fields'] as $field_data) {
                $pt = isset($field_data['price_type']) ? $field_data['price_type'] : 'none';
                $pa = isset($field_data['price_amount']) ? floatval($field_data['price_amount']) : 0;

                if ($pt === 'flat' && $pa > 0) {
                    $extra_price += $pa;
                } elseif ($pt === 'percentage' && $pa > 0) {
                    $extra_price += ($base_price * $pa / 100);
                }
            }

            if ($extra_price > 0) {
                $cart_item['data']->set_price($base_price + $extra_price);
            }
        }
    }

    /**
     * Render order-level custom fields on checkout page
     */
    public function render_order_level_fields($checkout) {
        $all_fieldsets = get_option('cartflow_custom_fieldsets', array());
        if (empty($all_fieldsets)) return;

        $order_fieldsets = array_filter($all_fieldsets, function($fs) {
            return (isset($fs['scope']) && $fs['scope'] === 'order')
                && (isset($fs['status']) && $fs['status'] === 'active');
        });

        if (empty($order_fieldsets)) return;

        usort($order_fieldsets, function($a, $b) {
            return ($a['position'] ?? 0) - ($b['position'] ?? 0);
        });

        echo '<div class="cartflow-order-fields">';

        foreach ($order_fieldsets as $fieldset) {
            $fieldset_name = sanitize_title($fieldset['name'] ?? '');
            $fields = isset($fieldset['fields']) ? $fieldset['fields'] : array();

            usort($fields, function($a, $b) {
                return ($a['position'] ?? 0) - ($b['position'] ?? 0);
            });

            if (!empty($fieldset['name'])) {
                echo '<h3>' . esc_html($fieldset['name']) . '</h3>';
            }

            foreach ($fields as $field) {
                $field_name = sanitize_title($field['name'] ?? '');
                $field_key = 'cartflow_order_' . $fieldset_name . '_' . $field_name;
                $field_type = isset($field['type']) ? $field['type'] : 'text';
                $field_label = isset($field['label']) ? $field['label'] : $field_name;
                $is_required = !empty($field['required']);

                if ($field_type === 'textarea') {
                    woocommerce_form_field($field_key, array(
                        'type' => 'textarea',
                        'label' => $field_label,
                        'required' => $is_required,
                        'placeholder' => isset($field['placeholder']) ? $field['placeholder'] : '',
                    ));
                } elseif ($field_type === 'dropdown') {
                    $opts = array('' => __('Select an option...', 'cartflow-bridge'));
                    foreach ((isset($field['options']) ? $field['options'] : array()) as $opt) {
                        $opts[$opt['value']] = $opt['label'];
                    }
                    woocommerce_form_field($field_key, array(
                        'type' => 'select',
                        'label' => $field_label,
                        'required' => $is_required,
                        'options' => $opts,
                    ));
                } elseif ($field_type === 'checkbox') {
                    woocommerce_form_field($field_key, array(
                        'type' => 'checkbox',
                        'label' => isset($field['checkboxLabel']) && $field['checkboxLabel'] ? $field['checkboxLabel'] : $field_label,
                        'required' => $is_required,
                    ));
                } elseif ($field_type === 'date_picker') {
                    woocommerce_form_field($field_key, array(
                        'type' => 'date',
                        'label' => $field_label,
                        'required' => $is_required,
                    ));
                } else {
                    // Default: text, number, color, etc.
                    woocommerce_form_field($field_key, array(
                        'type' => 'text',
                        'label' => $field_label,
                        'required' => $is_required,
                        'placeholder' => isset($field['placeholder']) ? $field['placeholder'] : '',
                    ));
                }
            }
        }

        echo '</div>';
    }

    /**
     * Save order-level custom fields to order meta (HPOS-compatible via WC_Order)
     */
    public function save_order_level_fields_hpos($order) {
        if (!$order || !is_a($order, 'WC_Order')) return;

        $all_fieldsets = get_option('cartflow_custom_fieldsets', array());
        if (empty($all_fieldsets)) return;

        $order_fieldsets = array_filter($all_fieldsets, function($fs) {
            return (isset($fs['scope']) && $fs['scope'] === 'order')
                && (isset($fs['status']) && $fs['status'] === 'active');
        });

        $updated = false;
        foreach ($order_fieldsets as $fieldset) {
            $fieldset_name = sanitize_title($fieldset['name'] ?? '');
            $fields = isset($fieldset['fields']) ? $fieldset['fields'] : array();

            foreach ($fields as $field) {
                $field_name = sanitize_title($field['name'] ?? '');
                $field_key = 'cartflow_order_' . $fieldset_name . '_' . $field_name;
                $value = isset($_POST[$field_key]) ? sanitize_text_field($_POST[$field_key]) : '';

                if (!empty($value)) {
                    $order->update_meta_data('_' . $field_key, $value);
                    $updated = true;
                }
            }
        }

        if ($updated) {
            $order->save();
        }
    }

    /**
     * Save order-level custom fields (legacy fallback for non-HPOS stores)
     */
    public function save_order_level_fields($order_id) {
        // Skip if HPOS handler already ran
        if (did_action('woocommerce_checkout_order_created') > 0) return;

        $all_fieldsets = get_option('cartflow_custom_fieldsets', array());
        if (empty($all_fieldsets)) return;

        $order = wc_get_order($order_id);
        if (!$order) return;

        $order_fieldsets = array_filter($all_fieldsets, function($fs) {
            return (isset($fs['scope']) && $fs['scope'] === 'order')
                && (isset($fs['status']) && $fs['status'] === 'active');
        });

        $updated = false;
        foreach ($order_fieldsets as $fieldset) {
            $fieldset_name = sanitize_title($fieldset['name'] ?? '');
            $fields = isset($fieldset['fields']) ? $fieldset['fields'] : array();

            foreach ($fields as $field) {
                $field_name = sanitize_title($field['name'] ?? '');
                $field_key = 'cartflow_order_' . $fieldset_name . '_' . $field_name;
                $value = isset($_POST[$field_key]) ? sanitize_text_field($_POST[$field_key]) : '';

                if (!empty($value)) {
                    $order->update_meta_data('_' . $field_key, $value);
                    $updated = true;
                }
            }
        }

        if ($updated) {
            $order->save();
        }
    }

    /**
     * Wrapper for classic checkout hook (woocommerce_checkout_order_processed)
     * which passes ($order_id, $posted_data, $order)
     */
    public function convert_order_currency_by_id($order_id, $posted_data, $order) {
        if (!$order) {
            $order = wc_get_order($order_id);
        }
        if ($order) {
            $this->convert_order_currency($order);
        }
    }

    /**
     * Convert order currency at checkout.
     * Runs after the order is fully created (all line items, shipping, fees present)
     * but before payment processing, so the gateway sees the converted total.
     */
    public function convert_order_currency($order) {
        // Prevent double-conversion if both hooks fire
        if ($order->get_meta('_cartflow_exchange_rate')) {
            return;
        }

        $settings = get_option('cartflow_currency_features', array());

        if (empty($settings['enabled'])) {
            return;
        }

        $base_currency = function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD';
        $gateway_currency = isset($settings['gateway_currency']) ? $settings['gateway_currency'] : 'USD';

        // Skip if currencies are the same
        if (strtoupper($base_currency) === strtoupper($gateway_currency)) {
            return;
        }

        $margin = isset($settings['margin_percent']) ? floatval($settings['margin_percent']) : 0;

        // Get exchange rate (manual override or auto)
        if (!empty($settings['rate_override']) && floatval($settings['rate_override']) > 0) {
            $rate = floatval($settings['rate_override']);
        } else {
            $rate = $this->fetch_exchange_rate($base_currency, $gateway_currency);
            if (is_wp_error($rate)) {
                // Log error but don't block checkout - use cached rate if available
                if (!empty($settings['cached_rate'])) {
                    $rate = floatval($settings['cached_rate']);
                } else {
                    return; // Cannot convert without a rate
                }
            }
        }

        // Apply margin
        $final_rate = $rate * (1 + $margin / 100);

        // Decimal places for the gateway currency (not the store setting, which is for the base currency)
        // Most currencies use 2 decimals; zero-decimal currencies listed below
        $zero_decimal_currencies = array('BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF');
        $decimals = in_array(strtoupper($gateway_currency), $zero_decimal_currencies) ? 0 : 2;

        // Override WooCommerce's price decimals so set_total/set_subtotal don't re-round
        // using the store's base currency decimals (e.g. 0 for EGP)
        $this->override_decimals = $decimals;
        add_filter('wc_get_price_decimals', array($this, 'filter_price_decimals'), 999);

        // Store original values in order meta
        $original_total = floatval($order->get_total());
        $order->update_meta_data('_cartflow_original_currency', $base_currency);
        $order->update_meta_data('_cartflow_original_total', $original_total);
        $order->update_meta_data('_cartflow_exchange_rate', $final_rate);
        $order->update_meta_data('_cartflow_margin_percent', $margin);

        // Update order currency
        $order->set_currency($gateway_currency);

        // Convert line item prices
        foreach ($order->get_items() as $item) {
            $item->set_subtotal(round(floatval($item->get_subtotal()) * $final_rate, $decimals));
            $item->set_total(round(floatval($item->get_total()) * $final_rate, $decimals));
            $item->save();
        }

        // Convert shipping line items
        foreach ($order->get_items('shipping') as $shipping) {
            $shipping->set_total(round(floatval($shipping->get_total()) * $final_rate, $decimals));
            $shipping->save();
        }

        // Convert fee line items
        foreach ($order->get_items('fee') as $fee) {
            $fee->set_total(round(floatval($fee->get_total()) * $final_rate, $decimals));
            $fee->save();
        }

        // Convert tax line items
        foreach ($order->get_items('tax') as $tax) {
            $tax->set_tax_total(round(floatval($tax->get_tax_total()) * $final_rate, $decimals));
            $tax->set_shipping_tax_total(round(floatval($tax->get_shipping_tax_total()) * $final_rate, $decimals));
            $tax->save();
        }

        // Convert order-level summary fields (used by emails and thank-you page)
        $order->set_shipping_total(round(floatval($order->get_shipping_total()) * $final_rate, $decimals));
        $order->set_shipping_tax(round(floatval($order->get_shipping_tax()) * $final_rate, $decimals));
        $order->set_cart_tax(round(floatval($order->get_cart_tax()) * $final_rate, $decimals));
        $order->set_discount_total(round(floatval($order->get_discount_total()) * $final_rate, $decimals));
        $order->set_discount_tax(round(floatval($order->get_discount_tax()) * $final_rate, $decimals));
        $order->set_total(round($original_total * $final_rate, $decimals));

        // Save the order (it was already saved before this hook fired)
        $order->save();

        // Remove the override so it doesn't affect the rest of WordPress
        remove_filter('wc_get_price_decimals', array($this, 'filter_price_decimals'), 999);
        $this->override_decimals = null;
    }

    /**
     * Filter to override WooCommerce price decimals during currency conversion
     */
    public function filter_price_decimals($decimals) {
        if ($this->override_decimals !== null) {
            return $this->override_decimals;
        }
        return $decimals;
    }

    /**
     * Display currency conversion notice in the checkout order review table
     */
    public function display_currency_conversion_notice() {
        $settings = get_option('cartflow_currency_features', array());

        if (empty($settings['enabled'])) {
            return;
        }

        $base_currency = function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD';
        $gateway_currency = isset($settings['gateway_currency']) ? $settings['gateway_currency'] : 'USD';

        if (strtoupper($base_currency) === strtoupper($gateway_currency)) {
            return;
        }

        $margin = isset($settings['margin_percent']) ? floatval($settings['margin_percent']) : 0;

        // Get rate
        if (!empty($settings['rate_override']) && floatval($settings['rate_override']) > 0) {
            $rate = floatval($settings['rate_override']);
        } else {
            $rate = $this->fetch_exchange_rate($base_currency, $gateway_currency);
            if (is_wp_error($rate)) {
                if (!empty($settings['cached_rate'])) {
                    $rate = floatval($settings['cached_rate']);
                } else {
                    return;
                }
            }
        }

        $final_rate = $rate * (1 + $margin / 100);
        $cart_total = WC()->cart->get_total('edit');
        $converted_total = $cart_total * $final_rate;

        $currency_symbol = get_woocommerce_currency_symbol($gateway_currency);

        ?>
        <tr class="cartflow-currency-notice" id="cartflow-currency-row" style="display: none;">
            <th><?php echo esc_html($gateway_currency); ?> <?php _e('Equivalent', 'cartflow-bridge'); ?></th>
            <td data-title="<?php echo esc_attr($gateway_currency); ?> Equivalent">
                <strong><?php echo esc_html($currency_symbol . number_format($converted_total, 2)); ?></strong>
                <br>
                <small style="color: #777;">
                    <?php printf(
                        __('Rate: 1 %1$s = %2$s %3$s', 'cartflow-bridge'),
                        esc_html($base_currency),
                        number_format($final_rate, 4),
                        esc_html($gateway_currency)
                    ); ?>
                    <?php if ($margin > 0): ?>
                        <?php printf(__('(incl. %s%% margin)', 'cartflow-bridge'), number_format($margin, 1)); ?>
                    <?php endif; ?>
                </small>
            </td>
        </tr>
        <?php
    }

    /**
     * JavaScript to show/hide the currency notice based on selected payment method
     */
    public function currency_conversion_checkout_script() {
        if (!is_checkout()) {
            return;
        }
        ?>
        <script type="text/javascript">
        (function() {
            function toggleCurrencyNotice() {
                var row = document.getElementById('cartflow-currency-row');
                if (!row) return;

                var selected = document.querySelector('input[name="payment_method"]:checked');
                if (!selected) {
                    row.style.display = 'none';
                    return;
                }

                // Show for all non-COD payment methods (card, stripe, paypal, etc.)
                var method = selected.value;
                if (method === 'cod' || method === 'cheque' || method === 'bacs') {
                    row.style.display = 'none';
                } else {
                    row.style.display = '';
                }
            }

            // Run on page load
            document.addEventListener('DOMContentLoaded', toggleCurrencyNotice);

            // Run when payment method changes
            document.body.addEventListener('change', function(e) {
                if (e.target && e.target.name === 'payment_method') {
                    toggleCurrencyNotice();
                }
            });

            // Run after WooCommerce updates the order review via AJAX
            jQuery(document.body).on('updated_checkout', toggleCurrencyNotice);
        })();
        </script>
        <?php
    }

    // ==================== HELPERS ====================

    private function format_states($states) {
        $formatted = array();
        foreach ($states as $code => $name) {
            $formatted[] = array('code' => $code, 'name' => $name);
        }
        return $formatted;
    }

    private function clear_wc_cache() {
        delete_transient('wc_countries');
        delete_transient('wc_countries_states');
        if (function_exists('wc_cache_flush')) {
            wc_cache_flush();
        }
    }

    private function get_timezone_list() {
        $zones = timezone_identifiers_list();
        $list = array();
        foreach ($zones as $zone) {
            $list[] = $zone;
        }
        return $list;
    }

    // ==================== ADMIN ====================

    public function add_admin_menu() {
        add_menu_page(
            __('CartFlow Bridge', 'cartflow-bridge'),
            __('CartFlow Bridge', 'cartflow-bridge'),
            'manage_options',
            'cartflow-bridge',
            array($this, 'render_admin_page'),
            'dashicons-rest-api',
            80
        );
    }

    public function register_settings() {
        register_setting('cartflow_bridge', 'cartflow_bridge_api_key');
        register_setting('cartflow_bridge', 'cartflow_hide_shipping_when_free');
        register_setting('cartflow_bridge', 'cartflow_currency_features');
    }

    public function render_admin_page() {
        $api_key = get_option('cartflow_bridge_api_key', '');
        $hide_shipping_when_free = get_option('cartflow_hide_shipping_when_free', 'yes');
        $currency_settings = wp_parse_args(get_option('cartflow_currency_features', array()), array(
            'enabled' => false,
            'gateway_currency' => 'USD',
            'margin_percent' => 0,
            'rate_override' => null,
        ));

        if (isset($_POST['generate_api_key']) && check_admin_referer('cartflow_bridge_nonce')) {
            $api_key = wp_generate_password(32, false);
            update_option('cartflow_bridge_api_key', $api_key);
            echo '<div class="notice notice-success"><p>' . __('API Key generated!', 'cartflow-bridge') . '</p></div>';
        }

        if (isset($_POST['save_shipping_settings']) && check_admin_referer('cartflow_bridge_shipping_nonce')) {
            $hide_shipping_when_free = isset($_POST['hide_shipping_when_free']) ? 'yes' : 'no';
            update_option('cartflow_hide_shipping_when_free', $hide_shipping_when_free);
            echo '<div class="notice notice-success"><p>' . __('Shipping settings saved!', 'cartflow-bridge') . '</p></div>';
        }

        if (isset($_POST['save_currency_settings']) && check_admin_referer('cartflow_bridge_currency_nonce')) {
            $currency_settings['enabled'] = isset($_POST['currency_enabled']);
            $currency_settings['gateway_currency'] = sanitize_text_field($_POST['gateway_currency'] ?? 'USD');
            $margin = floatval($_POST['margin_percent'] ?? 0);
            $currency_settings['margin_percent'] = max(0, min(50, $margin));
            $rate_override = $_POST['rate_override'] ?? '';
            $currency_settings['rate_override'] = ($rate_override !== '' && floatval($rate_override) > 0) ? floatval($rate_override) : null;
            update_option('cartflow_currency_features', $currency_settings);
            echo '<div class="notice notice-success"><p>' . __('Currency conversion settings saved!', 'cartflow-bridge') . '</p></div>';
        }

        // Get plugin version
        if (!function_exists('get_plugin_data')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        $plugin_data = get_plugin_data(__FILE__);
        $plugin_version = $plugin_data['Version'];
        ?>
        <div class="wrap">
            <h1><?php _e('CartFlow Bridge', 'cartflow-bridge'); ?> <small style="font-size: 14px; color: #666;">v<?php echo esc_html($plugin_version); ?></small></h1>
            <p><?php _e('REST API bridge for CartFlow to manage WordPress & WooCommerce settings.', 'cartflow-bridge'); ?></p>

            <h2><?php _e('Authentication', 'cartflow-bridge'); ?></h2>
            <p><?php _e('Use one of the following authentication methods:', 'cartflow-bridge'); ?></p>
            <ol>
                <li><strong><?php _e('WooCommerce API Keys', 'cartflow-bridge'); ?></strong> - <?php _e('Recommended. Use consumer_key and consumer_secret.', 'cartflow-bridge'); ?></li>
                <li><strong><?php _e('Custom API Key', 'cartflow-bridge'); ?></strong> - <?php _e('Use X-CartFlow-API-Key header.', 'cartflow-bridge'); ?></li>
                <li><strong><?php _e('WordPress Application Passwords', 'cartflow-bridge'); ?></strong> - <?php _e('Use Basic Auth with username and app password.', 'cartflow-bridge'); ?></li>
            </ol>

            <h3><?php _e('Custom API Key', 'cartflow-bridge'); ?></h3>
            <table class="form-table">
                <tr>
                    <th><?php _e('API Key', 'cartflow-bridge'); ?></th>
                    <td>
                        <code style="background: #f0f0f0; padding: 5px 10px;"><?php echo esc_html($api_key ?: __('Not generated', 'cartflow-bridge')); ?></code>
                        <form method="post" style="display:inline; margin-left: 10px;">
                            <?php wp_nonce_field('cartflow_bridge_nonce'); ?>
                            <input type="submit" name="generate_api_key" class="button" value="<?php _e('Generate New Key', 'cartflow-bridge'); ?>">
                        </form>
                    </td>
                </tr>
            </table>

            <hr>

            <h2><?php _e('Smart Features', 'cartflow-bridge'); ?></h2>
            <p><?php _e('CartFlow Bridge includes smart features to enhance your WooCommerce store.', 'cartflow-bridge'); ?></p>

            <form method="post">
                <?php wp_nonce_field('cartflow_bridge_shipping_nonce'); ?>
                <table class="form-table">
                    <tr>
                        <th scope="row"><?php _e('Smart Shipping', 'cartflow-bridge'); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" name="hide_shipping_when_free" value="1" <?php checked($hide_shipping_when_free, 'yes'); ?>>
                                <?php _e('Hide paid shipping methods when free shipping is available', 'cartflow-bridge'); ?>
                            </label>
                            <p class="description">
                                <?php _e('When a customer qualifies for free shipping, this will automatically hide other paid shipping options (like flat rate) to prevent confusion. Customers will only see free shipping as an option.', 'cartflow-bridge'); ?>
                            </p>
                        </td>
                    </tr>
                </table>
                <p class="submit">
                    <input type="submit" name="save_shipping_settings" class="button-primary" value="<?php _e('Save Shipping', 'cartflow-bridge'); ?>">
                </p>
            </form>

            <form method="post">
                <?php wp_nonce_field('cartflow_bridge_currency_nonce'); ?>
                <table class="form-table">
                    <tr>
                        <th scope="row"><?php _e('Currency Conversion', 'cartflow-bridge'); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" name="currency_enabled" value="1" <?php checked(!empty($currency_settings['enabled'])); ?>>
                                <?php _e('Enable checkout currency conversion', 'cartflow-bridge'); ?>
                            </label>
                            <p class="description">
                                <?php _e('Convert order totals at checkout from your store currency to the payment gateway currency. The converted amount is shown to customers when they select a card payment method.', 'cartflow-bridge'); ?>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php _e('Base Currency', 'cartflow-bridge'); ?></th>
                        <td>
                            <code><?php echo esc_html(function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'N/A'); ?></code>
                            <p class="description"><?php _e('Auto-detected from WooCommerce settings.', 'cartflow-bridge'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="gateway_currency"><?php _e('Gateway Currency', 'cartflow-bridge'); ?></label></th>
                        <td>
                            <select name="gateway_currency" id="gateway_currency">
                                <?php
                                $currencies = array('USD' => 'USD - US Dollar', 'EUR' => 'EUR - Euro', 'GBP' => 'GBP - British Pound', 'AED' => 'AED - UAE Dirham', 'SAR' => 'SAR - Saudi Riyal');
                                foreach ($currencies as $code => $label) {
                                    printf('<option value="%s" %s>%s</option>', esc_attr($code), selected($currency_settings['gateway_currency'], $code, false), esc_html($label));
                                }
                                ?>
                            </select>
                            <p class="description"><?php _e('The currency your payment gateway requires.', 'cartflow-bridge'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="margin_percent"><?php _e('Margin %', 'cartflow-bridge'); ?></label></th>
                        <td>
                            <input type="number" name="margin_percent" id="margin_percent" value="<?php echo esc_attr($currency_settings['margin_percent']); ?>" min="0" max="50" step="0.5" class="small-text">
                            <p class="description"><?php _e('Percentage added on top of the exchange rate (0-50%).', 'cartflow-bridge'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="rate_override"><?php _e('Rate Override', 'cartflow-bridge'); ?></label></th>
                        <td>
                            <input type="number" name="rate_override" id="rate_override" value="<?php echo esc_attr($currency_settings['rate_override'] ?? ''); ?>" min="0" step="0.000001" class="small-text" placeholder="<?php _e('Auto', 'cartflow-bridge'); ?>">
                            <p class="description"><?php _e('Leave empty to use the auto-fetched exchange rate. Set a value to override.', 'cartflow-bridge'); ?></p>
                        </td>
                    </tr>
                </table>
                <p class="submit">
                    <input type="submit" name="save_currency_settings" class="button-primary" value="<?php _e('Save Currency', 'cartflow-bridge'); ?>">
                </p>
            </form>

            <hr>

            <h2><?php _e('Available Endpoints', 'cartflow-bridge'); ?></h2>

            <h3><?php _e('Settings', 'cartflow-bridge'); ?></h3>
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th><?php _e('Method', 'cartflow-bridge'); ?></th>
                        <th><?php _e('Endpoint', 'cartflow-bridge'); ?></th>
                        <th><?php _e('Description', 'cartflow-bridge'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>GET/POST</code></td>
                        <td><code>/wp-json/cartflow/v1/settings/general</code></td>
                        <td><?php _e('Site title, tagline, admin email, timezone, date/time format, etc.', 'cartflow-bridge'); ?></td>
                    </tr>
                    <tr>
                        <td><code>GET/POST</code></td>
                        <td><code>/wp-json/cartflow/v1/settings/reading</code></td>
                        <td><?php _e('Homepage, posts per page, search engine visibility', 'cartflow-bridge'); ?></td>
                    </tr>
                    <tr>
                        <td><code>GET/POST</code></td>
                        <td><code>/wp-json/cartflow/v1/settings/discussion</code></td>
                        <td><?php _e('Comments, pingbacks, moderation settings', 'cartflow-bridge'); ?></td>
                    </tr>
                    <tr>
                        <td><code>GET/POST</code></td>
                        <td><code>/wp-json/cartflow/v1/settings/permalinks</code></td>
                        <td><?php _e('URL structure settings', 'cartflow-bridge'); ?></td>
                    </tr>
                    <tr>
                        <td><code>GET/POST</code></td>
                        <td><code>/wp-json/cartflow/v1/settings/woocommerce</code></td>
                        <td><?php _e('Store address, currency, tax, inventory, checkout, shipping settings', 'cartflow-bridge'); ?></td>
                    </tr>
                </tbody>
            </table>

            <h3><?php _e('Custom Options', 'cartflow-bridge'); ?></h3>
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th><?php _e('Method', 'cartflow-bridge'); ?></th>
                        <th><?php _e('Endpoint', 'cartflow-bridge'); ?></th>
                        <th><?php _e('Description', 'cartflow-bridge'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>GET/POST</code></td>
                        <td><code>/wp-json/cartflow/v1/options/{option_name}</code></td>
                        <td><?php _e('Get or update any WordPress option by name', 'cartflow-bridge'); ?></td>
                    </tr>
                    <tr>
                        <td><code>GET</code></td>
                        <td><code>/wp-json/cartflow/v1/options?options=opt1,opt2</code></td>
                        <td><?php _e('Get multiple options at once', 'cartflow-bridge'); ?></td>
                    </tr>
                    <tr>
                        <td><code>POST</code></td>
                        <td><code>/wp-json/cartflow/v1/options</code></td>
                        <td><?php _e('Update multiple options at once (JSON body)', 'cartflow-bridge'); ?></td>
                    </tr>
                </tbody>
            </table>

            <h3><?php _e('Custom Locations', 'cartflow-bridge'); ?></h3>
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th><?php _e('Method', 'cartflow-bridge'); ?></th>
                        <th><?php _e('Endpoint', 'cartflow-bridge'); ?></th>
                        <th><?php _e('Description', 'cartflow-bridge'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>GET/POST</code></td>
                        <td><code>/wp-json/cartflow/v1/locations/states</code></td>
                        <td><?php _e('Get all or add a custom state', 'cartflow-bridge'); ?></td>
                    </tr>
                    <tr>
                        <td><code>PUT/DELETE</code></td>
                        <td><code>/wp-json/cartflow/v1/locations/states/{country}/{state}</code></td>
                        <td><?php _e('Update or delete a custom state', 'cartflow-bridge'); ?></td>
                    </tr>
                    <tr>
                        <td><code>POST</code></td>
                        <td><code>/wp-json/cartflow/v1/locations/states/{country}/bulk</code></td>
                        <td><?php _e('Bulk update states for a country', 'cartflow-bridge'); ?></td>
                    </tr>
                    <tr>
                        <td><code>GET</code></td>
                        <td><code>/wp-json/cartflow/v1/locations/countries</code></td>
                        <td><?php _e('Get all countries with states (including custom)', 'cartflow-bridge'); ?></td>
                    </tr>
                </tbody>
            </table>

            <h3><?php _e('Smart Features', 'cartflow-bridge'); ?></h3>
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th><?php _e('Method', 'cartflow-bridge'); ?></th>
                        <th><?php _e('Endpoint', 'cartflow-bridge'); ?></th>
                        <th><?php _e('Description', 'cartflow-bridge'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>GET/POST</code></td>
                        <td><code>/wp-json/cartflow/v1/features/shipping</code></td>
                        <td><?php _e('Smart Shipping: hide paid methods when free shipping qualifies', 'cartflow-bridge'); ?></td>
                    </tr>
                    <tr>
                        <td><code>GET/POST</code></td>
                        <td><code>/wp-json/cartflow/v1/features/currency</code></td>
                        <td><?php _e('Currency Conversion: configure gateway currency, margin, and rate override', 'cartflow-bridge'); ?></td>
                    </tr>
                    <tr>
                        <td><code>GET</code></td>
                        <td><code>/wp-json/cartflow/v1/features/currency/live-rate</code></td>
                        <td><?php _e('Get live exchange rate between base and target currencies', 'cartflow-bridge'); ?></td>
                    </tr>
                </tbody>
            </table>

            <h3><?php _e('System Info', 'cartflow-bridge'); ?></h3>
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th><?php _e('Method', 'cartflow-bridge'); ?></th>
                        <th><?php _e('Endpoint', 'cartflow-bridge'); ?></th>
                        <th><?php _e('Description', 'cartflow-bridge'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>GET</code></td>
                        <td><code>/wp-json/cartflow/v1/system/info</code></td>
                        <td><?php _e('WordPress, PHP, MySQL, WooCommerce versions', 'cartflow-bridge'); ?></td>
                    </tr>
                    <tr>
                        <td><code>GET</code></td>
                        <td><code>/wp-json/cartflow/v1/system/plugins</code></td>
                        <td><?php _e('List all installed plugins', 'cartflow-bridge'); ?></td>
                    </tr>
                    <tr>
                        <td><code>GET</code></td>
                        <td><code>/wp-json/cartflow/v1/system/themes</code></td>
                        <td><?php _e('List all installed themes', 'cartflow-bridge'); ?></td>
                    </tr>
                </tbody>
            </table>
        </div>
        <?php
    }
}

// Inject custom states into WooCommerce and remove hidden states
add_filter('woocommerce_states', function($states) {
    // Add custom states
    $custom_states = get_option('cartflow_custom_states', array());
    foreach ($custom_states as $country_code => $country_states) {
        if (!isset($states[$country_code])) {
            $states[$country_code] = array();
        }
        foreach ($country_states as $state_code => $state_name) {
            $states[$country_code][$state_code] = $state_name;
        }
        if (!empty($states[$country_code])) {
            asort($states[$country_code]);
        }
    }

    // Remove hidden states (works for both built-in and custom states)
    $hidden_states = get_option('cartflow_hidden_states', array());
    foreach ($hidden_states as $country_code => $hidden_codes) {
        if (isset($states[$country_code]) && is_array($hidden_codes)) {
            foreach ($hidden_codes as $state_code) {
                unset($states[$country_code][$state_code]);
            }
        }
    }

    return $states;
});

// Initialize
add_action('plugins_loaded', array('CartFlow_Bridge', 'get_instance'));
