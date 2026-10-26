package br.com.navitasassist.config;

import org.springframework.boot.autoconfigure.flyway.FlywayConfigurationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Map;

import javax.sql.DataSource;

@Configuration
public class WorkflowMigrationConfig {
    @Bean
    FlywayConfigurationCustomizer workflowMigrationPlaceholders(DataSource dataSource) {
        return configuration -> {
            try (var connection = dataSource.getConnection()) {
                boolean mysql =
                        connection.getMetaData().getDatabaseProductName().equalsIgnoreCase("MySQL");
                configuration.placeholders(
                        Map.of("dropCheck", mysql ? "DROP CHECK" : "DROP CONSTRAINT"));
            } catch (java.sql.SQLException e) {
                throw new IllegalStateException("Cannot identify workflow migration dialect", e);
            }
        };
    }
}
