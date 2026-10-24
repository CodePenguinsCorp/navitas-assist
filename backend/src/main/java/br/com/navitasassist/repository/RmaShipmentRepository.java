package br.com.navitasassist.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import br.com.navitasassist.shipment.RmaShipment;
import br.com.navitasassist.shipment.ShipmentStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RmaShipmentRepository extends JpaRepository<RmaShipment, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from RmaShipment s where s.id = :id")
    Optional<RmaShipment> findByIdForUpdate(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from RmaShipment s where upper(s.carrier) = upper(:carrier) and upper(s.trackingCode) = upper(:trackingCode)")
    Optional<RmaShipment> findByCarrierAndTrackingCodeForUpdate(@Param("carrier") String carrier, @Param("trackingCode") String trackingCode);

    @Query("""
        select count(s) > 0
        from RmaShipment s
        where upper(s.carrier) = upper(:carrier)
          and upper(s.trackingCode) = upper(:trackingCode)
          and (:excludedId is null or s.id <> :excludedId)
        """)
    boolean existsTrackingCode(@Param("carrier") String carrier, @Param("trackingCode") String trackingCode, @Param("excludedId") Long excludedId);

    @Query("""
        select s
        from RmaShipment s
        join fetch s.rma r
        where (:rmaId is null or r.id = :rmaId)
          and (:status is null or s.status = :status)
        order by s.createdAt desc, s.id desc
        """)
    List<RmaShipment> search(@Param("rmaId") Long rmaId, @Param("status") ShipmentStatus status);

    @Query("select s from RmaShipment s where s.closedAt < :closedBefore and s.addressesPurgedAt is null")
    List<RmaShipment> findClosedWithAddressesBefore(@Param("closedBefore") Instant closedBefore);
}
