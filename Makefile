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
	rm -Rf ~/.npmrc;
	rm -Rf ${PWD}/.node_libraries;
	cd deps/npm; export PATH=${PWD}/bin:"$(PATH)"; make install
	PATH=bin bin/npm config set root  ${PWD}/.node_libraries
	PATH=bin bin/npm config set binroot ${PWD}/bin
	PATH=bin bin/npm config set tar `which tar`
	PATH=bin bin/npm config set gzipbin `which gzip`

# npm:
# 	rm -Rf ${PWD}/.node_libraries;
# 	cd deps/npm; export PATH=${PWD}/bin:$(PATH); make
# 	bin/npm config set root  ${PWD}/.node_libraries

npmmods:
	PATH=bin bin/npm install vows@latest;
	PATH=bin bin/npm install express@latest;
	PATH=bin bin/npm install ejs@latest;	
	PATH=bin bin/npm install redis@latest;
	PATH=bin bin/npm install node-evented@latest;	
