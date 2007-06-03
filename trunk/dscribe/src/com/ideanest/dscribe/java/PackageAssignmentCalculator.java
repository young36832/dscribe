package com.ideanest.dscribe.java;

import org.exist.fluent.NamespaceMap;
import org.exist.fluent.Node;

import com.ideanest.dscribe.Namespace;
import com.ideanest.dscribe.opti.AnnealingDiagramAssigner;

public class PackageAssignmentCalculator implements AnnealingDiagramAssigner.Calculator {
	
	private static final NamespaceMap NAMESPACE_BINDINGS = new NamespaceMap(
			"java", Namespace.JAVA
	);
	
	public NamespaceMap getNamespaceBindings() {
		return NAMESPACE_BINDINGS;
	}
	
	public String getElementQueryFragment() {return "//java:package";}
	
	public double calculateCost(Node e1, Node e2) {
		assert e1.qname().equals(DiagramExtractor.JAVA_PACKAGE);
		double cost = 0.0;
		if (e2.qname().equals(DiagramExtractor.JAVA_PACKAGE)) {
			cost -= 500 * AnnealingDiagramAssigner.commonPrefixFraction(e1.value(), e2.value());
		} else {
			cost += 100;
		}
		return cost;
	}
	
}