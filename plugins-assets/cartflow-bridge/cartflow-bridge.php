<?php
/**
 * Plugin Name: CartFlow Bridge
 * Plugin URI: https://cartflow.app
 * Description: REST API bridge for CartFlow to manage WordPress & WooCommerce settings that lack native API support
 * Version: 1.1.0
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
            add_filter('woocommerce_package_rates', array($this, 'hide_shipping_when_free_available'), 100);
        }
    }

    /**
     * Hide other shipping methods when free shipping is available
     * This prevents customers from seeing paid options when they qualify for free shipping
     */
    public function hide_shipping_when_free_available($rates) {
        $free_shipping = array();

        // Find free shipping methods
        foreach ($rates as $rate_id => $rate) {
            if ('free_shipping' === $rate->method_id) {
                $free_shipping[$rate_id] = $rate;
            }
        }

        // If free shipping exists, only return free shipping options
        return !empty($free_shipping) ? $free_shipping : $rates;
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
                return true;
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
    }

    public function render_admin_page() {
        $api_key = get_option('cartflow_bridge_api_key', '');
        $hide_shipping_when_free = get_option('cartflow_hide_shipping_when_free', 'yes');

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
                    <input type="submit" name="save_shipping_settings" class="button-primary" value="<?php _e('Save Features', 'cartflow-bridge'); ?>">
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

// Inject custom states into WooCommerce
add_filter('woocommerce_states', function($states) {
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
    return $states;
});

// Initialize
add_action('plugins_loaded', array('CartFlow_Bridge', 'get_instance'));
