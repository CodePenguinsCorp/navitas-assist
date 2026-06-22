package br.com.navitasassist.item;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Embeddable
public class ItemIdentification {

    @Column(name = "batch_number", length = 60)
    private String batchNumber;

    @Column(name = "serial_number", length = 60)
    private String serialNumber;

    @Column(name = "manufactured_at")
    private LocalDate manufacturedAt;

    public boolean isEmpty() {
        return (batchNumber == null || batchNumber.isBlank())
            && (serialNumber == null || serialNumber.isBlank());
    }
}
