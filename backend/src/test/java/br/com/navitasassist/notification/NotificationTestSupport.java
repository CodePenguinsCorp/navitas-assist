package br.com.navitasassist.notification;

import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.util.concurrent.ThreadPoolExecutor;

import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Notifications are processed on their own executor after the producer commits; tests wait for it to drain.
 */
final class NotificationTestSupport {

    private NotificationTestSupport() {
    }

    static void awaitIdle(ThreadPoolTaskExecutor executor) {
        ThreadPoolExecutor pool = executor.getThreadPoolExecutor();
        await().atMost(Duration.ofSeconds(15)).pollInterval(Duration.ofMillis(20))
            .until(() -> pool.getQueue().isEmpty() && pool.getActiveCount() == 0 && pool.getCompletedTaskCount() == pool.getTaskCount());
    }
}
