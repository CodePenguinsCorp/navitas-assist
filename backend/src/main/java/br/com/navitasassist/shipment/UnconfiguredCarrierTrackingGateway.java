package br.com.navitasassist.shipment;

import java.util.List;

import br.com.navitasassist.controller.CarrierUnavailableException;
import org.springframework.stereotype.Component;

@Component
public class UnconfiguredCarrierTrackingGateway implements CarrierTrackingGateway {

    @Override
    public List<CarrierTrackingEvent> fetchEvents(String carrier, String trackingCode) {
        throw new CarrierUnavailableException("No carrier integration is configured. Register tracking events manually.");
    }
}
