package br.com.navitasassist.config;

import org.hibernate.boot.model.FunctionContributions;
import org.hibernate.boot.model.FunctionContributor;
import org.hibernate.type.StandardBasicTypes;

/**
 * Expõe ao HQL o {@code unaccent(text)} do PostgreSQL (extensão criada pela V1), para que buscas e ordenação por nome
 * ignorem acento sem depender da collation do banco: {@code lower(unaccent(x)) like lower(unaccent(:query))}.
 * Registrado em {@code META-INF/services/org.hibernate.boot.model.FunctionContributor}.
 */
public class PostgresFunctions implements FunctionContributor {

    @Override
    public void contributeFunctions(FunctionContributions contributions) {
        contributions.getFunctionRegistry().registerPattern(
            "unaccent",
            "unaccent(?1)",
            contributions.getTypeConfiguration().getBasicTypeRegistry().resolve(StandardBasicTypes.STRING)
        );
    }
}
