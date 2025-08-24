#ifndef BREZN_FFI_H
#define BREZN_FFI_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include <stdbool.h>

// FFI-safe wrapper structs
typedef struct BreznFFI BreznFFI;
typedef struct PostFFI PostFFI;
typedef struct NetworkStatusFFI NetworkStatusFFI;

// Post structure
struct PostFFI {
    char* id;
    char* content;
    uint64_t timestamp;
    char* pseudonym;
    char* node_id;
};

// Network status structure
struct NetworkStatusFFI {
    bool network_enabled;
    bool tor_enabled;
    uint32_t peers_count;
    uint32_t discovery_peers_count;
    uint16_t port;
    uint16_t tor_socks_port;
};

// Result enum
typedef enum {
    BREZN_FFI_SUCCESS = 0,
    BREZN_FFI_ERROR = 1
} BreznFFIResult;

// Core FFI Functions

/**
 * Initialize the Brezn FFI with network configuration
 * @param network_port Network port for P2P communication
 * @param tor_socks_port Tor SOCKS proxy port
 * @return Pointer to BreznFFI instance or NULL on error
 */
BreznFFI* brezn_ffi_init(uint16_t network_port, uint16_t tor_socks_port);

/**
 * Start the Brezn application
 * @param ffi Pointer to BreznFFI instance
 * @return Success or error result
 */
BreznFFIResult brezn_ffi_start(BreznFFI* ffi);

/**
 * Create a new post
 * @param content Post content text
 * @param pseudonym Author pseudonym
 * @return Success or error result
 */
BreznFFIResult brezn_ffi_create_post(const char* content, const char* pseudonym);

/**
 * Get all posts
 * @return Array of PostFFI structures (caller must free with brezn_ffi_free_posts)
 */
PostFFI* brezn_ffi_get_posts(void);

/**
 * Get network status information
 * @return NetworkStatusFFI structure (caller must free with brezn_ffi_free_network_status)
 */
NetworkStatusFFI* brezn_ffi_get_network_status(void);

/**
 * Enable Tor network
 * @return Success or error result
 */
BreznFFIResult brezn_ffi_enable_tor(void);

/**
 * Disable Tor network
 */
void brezn_ffi_disable_tor(void);

/**
 * Generate QR code for peer discovery
 * @return QR code data string (caller must free with brezn_ffi_free_string)
 */
char* brezn_ffi_generate_qr_code(void);

/**
 * Parse QR code to add peer
 * @param qr_data QR code data string
 * @return Success or error result
 */
BreznFFIResult brezn_ffi_parse_qr_code(const char* qr_data);

// Memory Management

/**
 * Free a string returned by FFI functions
 * @param ptr String pointer to free
 */
void brezn_ffi_free_string(char* ptr);

/**
 * Free posts array returned by brezn_ffi_get_posts
 * @param posts Posts array pointer to free
 */
void brezn_ffi_free_posts(PostFFI* posts);

/**
 * Free network status returned by brezn_ffi_get_network_status
 * @param status Network status pointer to free
 */
void brezn_ffi_free_network_status(NetworkStatusFFI* status);

/**
 * Cleanup global FFI resources
 */
void brezn_ffi_cleanup(void);

// Performance & Monitoring

/**
 * Get performance metrics
 * @return JSON string with performance data (caller must free with brezn_ffi_free_string)
 */
char* brezn_ffi_get_performance_metrics(void);

/**
 * Get device information
 * @return JSON string with device info (caller must free with brezn_ffi_free_string)
 */
char* brezn_ffi_get_device_info(void);

/**
 * Test P2P network functionality
 * @return Success or error result
 */
BreznFFIResult brezn_ffi_test_p2p_network(void);

#ifdef __cplusplus
}
#endif

#endif // BREZN_FFI_H