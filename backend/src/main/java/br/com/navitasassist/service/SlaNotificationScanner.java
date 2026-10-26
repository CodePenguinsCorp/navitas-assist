package br.com.navitasassist.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;

import br.com.navitasassist.notification.NotificationEventType;
import br.com.navitasassist.notification.RmaNotificationEvent;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaSlaResponse;
import br.com.navitasassist.rma.RmaSlaStatus;
import br.com.navitasassist.rma.RmaStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Turns SLA states into notification events. The key includes the stage start, so each stage of an RMA alerts at most
 * once per SLA level no matter how often the scan runs. Periodic execution lives in {@link SlaNotificationScheduler}.
 */
@Service
public class SlaNotificationScanner {

    private static final EnumSet<RmaStatus> CLOSED = EnumSet.of(RmaStatus.COMPLETED, RmaStatus.RETURNED, RmaStatus.IRREPARABLE);

    private final RmaRecordRepository rmaRecordRepository;
    private final RmaSlaService rmaSlaService;
    private final NotificationProcessor notificationProcessor;
    private final TransactionTemplate readOnlyTransaction;

    public SlaNotificationScanner(RmaRecordRepository rmaRecordRepository, RmaSlaService rmaSlaService, NotificationProcessor notificationProcessor, PlatformTransactionManager transactionManager) {
        this.rmaRecordRepository = rmaRecordRepository;
        this.rmaSlaService = rmaSlaService;
        this.notificationProcessor = notificationProcessor;
        this.readOnlyTransaction = new TransactionTemplate(transactionManager);
        this.readOnlyTransaction.setReadOnly(true);
    }

    public void scan(Instant now) {
        List<RmaNotificationEvent> events = readOnlyTransaction.execute(status -> {
            List<RmaNotificationEvent> found = new ArrayList<>();
            for (RmaRecord rma : rmaRecordRepository.findByStatusNotIn(CLOSED)) {
                RmaSlaResponse sla = rmaSlaService.calculate(rma, now);
                NotificationEventType type = sla.status() == RmaSlaStatus.OVERDUE ? NotificationEventType.SLA_OVERDUE
                    : sla.status() == RmaSlaStatus.WARNING ? NotificationEventType.SLA_WARNING : null;
                if (type != null) {
                    found.add(new RmaNotificationEvent(type, type + ":" + rma.getId() + ":" + rma.getStatus() + ":" + sla.startedAt().toEpochMilli(), rma.getId(), now));
                }
            }
            return found;
        });

        if (events != null) {
            events.forEach(notificationProcessor::process);
        }
    }
}
