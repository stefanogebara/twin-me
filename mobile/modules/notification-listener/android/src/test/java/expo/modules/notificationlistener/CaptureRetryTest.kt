package expo.modules.notificationlistener
import org.junit.Assert.assertEquals
import org.junit.Test
class CaptureRetryTest {
  @Test fun onlySuccessfulDeliveryIsAcknowledged() {
    assertEquals("sent",captureOutcome(201))
    assertEquals("retry",captureOutcome(429))
    assertEquals("retry",captureOutcome(503))
    assertEquals("auth",captureOutcome(401))
    assertEquals("failed",captureOutcome(422))
  }
}
