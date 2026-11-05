package br.com.navitasassist.repository;

import br.com.navitasassist.shipment.RmaShipmentEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RmaShipmentEventRepository extends JpaRepository<RmaShipmentEvent, Long> {
}
