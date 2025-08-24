use brezn::{discovery, network, types, crypto, database, error};
use std::collections::HashMap;
use std::env;

#[tokio::test]
async fn test_runner_comprehensive() {
    // Comprehensive test runner that covers all major functionality
    let mut test_results = HashMap::new();
    
    // Test 1: Basic functionality
    test_results.insert("basic_functionality", test_basic_functionality());
    
    // Test 2: Network operations
    test_results.insert("network_operations", test_network_operations().await);
    
    // Test 3: Crypto operations
    test_results.insert("crypto_operations", test_crypto_operations());
    
    // Test 4: Database operations
    test_results.insert("database_operations", test_database_operations());
    
    // Test 5: Error handling
    test_results.insert("error_handling", test_error_handling());
    
    // Generate test results summary
    let total_tests = test_results.len();
    let passed_tests = test_results.values().filter(|&&r| r).count();
    let failed_tests = total_tests - passed_tests;
    let success_rate = (passed_tests as f64 / total_tests as f64 * 100.0) as i32;
    let exit_success = failed_tests == 0;
    
    // Write test results to environment file for CI
    let test_results_env = format!(
        "TOTAL_TESTS={}\nPASSED_TESTS={}\nFAILED_TESTS={}\nSUCCESS_RATE={}\nEXIT_SUCCESS={}\n",
        total_tests, passed_tests, failed_tests, success_rate, exit_success
    );
    
    std::fs::write("test_results.env", test_results_env).unwrap();
    
    // Assert overall success
    assert!(exit_success, "Some tests failed: {}/{} passed", passed_tests, total_tests);
}

fn test_basic_functionality() -> bool {
    // Test basic types and functionality
    let message = types::Message::new("test message");
    message.content() == "test message"
}

async fn test_network_operations() -> bool {
    // Test network operations
    let network_result = network::Network::new().await;
    network_result.is_ok()
}

fn test_crypto_operations() -> bool {
    // Test cryptographic operations
    let data = b"test data";
    let hash_result = crypto::hash_data(data);
    hash_result.is_ok()
}

fn test_database_operations() -> bool {
    // Test database operations
    let db_result = database::Database::new_in_memory();
    db_result.is_ok()
}

fn test_error_handling() -> bool {
    // Test error handling
    let error = error::BreznError::NetworkError("test".to_string());
    !error.to_string().is_empty()
}

#[test]
fn test_runner_sync() {
    // Synchronous test runner for non-async tests
    let mut results = vec![];
    
    results.push(test_basic_functionality());
    results.push(test_crypto_operations());
    results.push(test_database_operations());
    results.push(test_error_handling());
    
    let all_passed = results.iter().all(|&r| r);
    assert!(all_passed, "Some synchronous tests failed");
}