#!/bin/bash
# ============================================================================
# OAuth Rate Limit Testing Script
# ============================================================================
# This script tests the OAuth rate limiting on the Twin AI Learn API
# It verifies that rate limits are enforced correctly for authorization
# and callback endpoints.
#
# Usage: ./test-rate-limit.sh
# ============================================================================

API_BASE="http://localhost:3001/api"
TEST_IP="192.168.1.100"
TEST_USER_ID="test-user-123"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
success_count=0
blocked_count=0
total_tests=0

echo "=============================================="
echo "OAuth Rate Limit Testing"
echo "=============================================="
echo ""

# ============================================================================
# Test 1: Authorization Endpoint Rate Limiting
# Limit: 10 requests per 15 minutes
# ============================================================================

echo -e "${BLUE}Test 1: Authorization Endpoint (/connect/spotify)${NC}"
echo "Expected: First 10 requests succeed, 11th+ blocked (429)"
echo "----------------------------------------------"

success_count=0
blocked_count=0

for i in {1..15}; do
  response=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: $TEST_IP" \
    -d "{\"userId\": \"$TEST_USER_ID\"}" \
    "$API_BASE/entertainment/connect/spotify" 2>/dev/null)

  status_code=$(echo "$response" | tail -n1)

  # Extract rate limit headers
  headers=$(curl -s -I \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: $TEST_IP" \
    -d "{\"userId\": \"$TEST_USER_ID\"}" \
    "$API_BASE/entertainment/connect/spotify" 2>/dev/null)

  limit=$(echo "$headers" | grep -i "ratelimit-limit:" | awk '{print $2}' | tr -d '\r')
  remaining=$(echo "$headers" | grep -i "ratelimit-remaining:" | awk '{print $2}' | tr -d '\r')

  if [ "$status_code" = "200" ] || [ "$status_code" = "302" ]; then
    ((success_count++))
    echo -e "Request $i: ${GREEN}✓ SUCCESS${NC} (Status: $status_code, Remaining: $remaining/$limit)"
  elif [ "$status_code" = "429" ]; then
    ((blocked_count++))
    retry_after=$(echo "$headers" | grep -i "retry-after:" | awk '{print $2}' | tr -d '\r')
    echo -e "Request $i: ${RED}✗ BLOCKED${NC} (429 - Rate Limit Exceeded)"
    echo -e "   Retry-After: ${YELLOW}$retry_after seconds${NC}"
  else
    echo -e "Request $i: ${YELLOW}? UNEXPECTED${NC} (Status: $status_code)"
  fi

  sleep 0.2  # Small delay between requests
done

echo ""
echo "Results:"
echo -e "  ${GREEN}Successful:${NC} $success_count"
echo -e "  ${RED}Blocked:${NC} $blocked_count"
echo ""

if [ $success_count -ge 10 ] && [ $blocked_count -gt 0 ]; then
  echo -e "${GREEN}✓ Test 1 PASSED${NC}: Rate limit working correctly!"
else
  echo -e "${RED}✗ Test 1 FAILED${NC}: Expected at least 10 successful and some blocked requests"
fi

echo ""
echo "=============================================="
echo ""

# ============================================================================
# Test 2: Callback Endpoint Rate Limiting
# Limit: 20 requests per 15 minutes
# ============================================================================

echo -e "${BLUE}Test 2: Callback Endpoint (/oauth/callback)${NC}"
echo "Expected: First 20 requests succeed, 21st+ blocked (429)"
echo "----------------------------------------------"

success_count=0
blocked_count=0

for i in {1..25}; do
  response=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 192.168.1.101" \
    -d "{\"code\": \"test-code-$i\", \"state\": \"test-state-$i\"}" \
    "$API_BASE/entertainment/oauth/callback" 2>/dev/null)

  status_code=$(echo "$response" | tail -n1)

  # Extract rate limit headers
  headers=$(curl -s -I \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 192.168.1.101" \
    -d "{\"code\": \"test-code\", \"state\": \"test-state\"}" \
    "$API_BASE/entertainment/oauth/callback" 2>/dev/null)

  limit=$(echo "$headers" | grep -i "ratelimit-limit:" | awk '{print $2}' | tr -d '\r')
  remaining=$(echo "$headers" | grep -i "ratelimit-remaining:" | awk '{print $2}' | tr -d '\r')

  if [ "$status_code" = "400" ] || [ "$status_code" = "200" ]; then
    # 400 is expected for invalid state, but it's not rate-limited
    ((success_count++))
    echo -e "Request $i: ${GREEN}✓ NOT BLOCKED${NC} (Status: $status_code, Remaining: $remaining/$limit)"
  elif [ "$status_code" = "429" ]; then
    ((blocked_count++))
    echo -e "Request $i: ${RED}✗ BLOCKED${NC} (429 - Rate Limit Exceeded)"
  else
    echo -e "Request $i: ${YELLOW}? UNEXPECTED${NC} (Status: $status_code)"
  fi

  sleep 0.1
done

echo ""
echo "Results:"
echo -e "  ${GREEN}Not Blocked:${NC} $success_count"
echo -e "  ${RED}Blocked:${NC} $blocked_count"
echo ""

if [ $success_count -ge 20 ] && [ $blocked_count -gt 0 ]; then
  echo -e "${GREEN}✓ Test 2 PASSED${NC}: Callback rate limit working correctly!"
else
  echo -e "${RED}✗ Test 2 FAILED${NC}: Expected at least 20 successful and some blocked requests"
fi

echo ""
echo "=============================================="
echo ""

# ============================================================================
# Test 3: Multiple IPs Don't Affect Each Other
# ============================================================================

echo -e "${BLUE}Test 3: IP Isolation${NC}"
echo "Expected: Different IPs have independent rate limits"
echo "----------------------------------------------"

# IP1: Make requests until blocked
echo -e "${YELLOW}Testing IP 192.168.1.200...${NC}"
for i in {1..11}; do
  response=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 192.168.1.200" \
    -d "{\"userId\": \"test-user-ip1\"}" \
    "$API_BASE/entertainment/connect/youtube" 2>/dev/null)

  status_code=$(echo "$response" | tail -n1)

  if [ "$status_code" = "429" ]; then
    echo -e "Request $i: ${RED}✗ BLOCKED${NC} (as expected)"
    break
  fi
done

# IP2: Should still work
echo -e "${YELLOW}Testing IP 192.168.1.201...${NC}"
response=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 192.168.1.201" \
  -d "{\"userId\": \"test-user-ip2\"}" \
  "$API_BASE/entertainment/connect/youtube" 2>/dev/null)

status_code=$(echo "$response" | tail -n1)

if [ "$status_code" = "200" ] || [ "$status_code" = "302" ]; then
  echo -e "${GREEN}✓ Test 3 PASSED${NC}: IP2 not affected by IP1's rate limit"
else
  echo -e "${RED}✗ Test 3 FAILED${NC}: IP2 was blocked (Status: $status_code)"
fi

echo ""
echo "=============================================="
echo ""

# ============================================================================
# Test 4: Rate Limit Headers Verification
# ============================================================================

echo -e "${BLUE}Test 4: Rate Limit Headers${NC}"
echo "Expected: RateLimit-* headers present in responses"
echo "----------------------------------------------"

headers=$(curl -s -I \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 192.168.1.202" \
  -d "{\"userId\": \"test-user-headers\"}" \
  "$API_BASE/entertainment/connect/github" 2>/dev/null)

limit=$(echo "$headers" | grep -i "ratelimit-limit:" | awk '{print $2}' | tr -d '\r')
remaining=$(echo "$headers" | grep -i "ratelimit-remaining:" | awk '{print $2}' | tr -d '\r')
reset=$(echo "$headers" | grep -i "ratelimit-reset:" | awk '{print $2}' | tr -d '\r')

echo "Headers found:"
echo -e "  ${GREEN}RateLimit-Limit:${NC} $limit"
echo -e "  ${GREEN}RateLimit-Remaining:${NC} $remaining"
echo -e "  ${GREEN}RateLimit-Reset:${NC} $reset"

if [ ! -z "$limit" ] && [ ! -z "$remaining" ] && [ ! -z "$reset" ]; then
  echo -e "${GREEN}✓ Test 4 PASSED${NC}: All rate limit headers present"
else
  echo -e "${RED}✗ Test 4 FAILED${NC}: Missing rate limit headers"
fi

echo ""
echo "=============================================="
echo "All Tests Complete!"
echo "=============================================="
