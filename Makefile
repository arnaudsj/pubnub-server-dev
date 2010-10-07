all: git nodejs redis npm npmmods

clean:
	rm -Rf ${PWD}/.node_libraries; rm -Rf ${PWD}/bin; rm -Rf ${PWD}/share; rm -Rf ${PWD}/include;

tests:
	bin/vows --spec
	
git:
	git submodule init; git submodule update

nodejs:
	cd deps/node; make clean; ./configure --prefix=${PWD}; make; make install;
	rm -Rf ${PWD}/lib/node;

redis:
	cd deps/redis; make install PREFIX=${PWD}
	
npm:
	rm -Rf ${PWD}/.node_libraries;
	cd deps/npm; export PATH=${PWD}/bin:$(PATH); make
	bin/npm config set root  ${PWD}/.node_libraries
	
npmmods:
	bin/npm install vows@stable;
	bin/npm install express@stable;
	bin/npm install ejs@stable;	
	bin/npm install redis@stable;