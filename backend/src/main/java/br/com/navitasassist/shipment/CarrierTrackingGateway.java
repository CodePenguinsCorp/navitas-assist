package br.com.navitasassist.shipment;

import java.util.List;

/**
 * Port for carrier integrations. Implementations throw {@link br.com.navitasassist.controller.CarrierUnavailableException}
 * when the carrier cannot be reached; returned events are deduplicated by {@link CarrierTrackingEvent#externalEventId()}.
 */
public interface CarrierTrackingGateway {

    List<CarrierTrackingEvent> fetchEvents(String carrier, String trackingCode);
}
